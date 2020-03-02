import * as dcmjs from 'dcmjs';
import queryString from 'query-string';
import dicomParser from 'dicom-parser';
import { api } from 'dicomweb-client';
import DICOMWeb from '../DICOMWeb';
import { getFallbackTagFromInstance } from '../utils/UIDSpecificMetadataProviderFallbackTags';

/**
 * Simple cache schema for retrieved color palettes.
 */
const paletteColorCache = {
  count: 0,
  maxAge: 24 * 60 * 60 * 1000, // 24h cache?
  entries: {},
  isValidUID: function(PaletteColorLookupTableUID) {
    return (
      typeof PaletteColorLookupTableUID === 'string' &&
      PaletteColorLookupTableUID.length > 0
    );
  },
  get: function(PaletteColorLookupTableUID) {
    let entry = null;
    if (this.entries.hasOwnProperty(PaletteColorLookupTableUID)) {
      entry = this.entries[PaletteColorLookupTableUID];
      // check how the entry is...
      if (Date.now() - entry.time > this.maxAge) {
        // entry is too old... remove entry.
        delete this.entries[PaletteColorLookupTableUID];
        this.count--;
        entry = null;
      }
    }
    return entry;
  },
  add: function(entry) {
    if (this.isValidUID(entry.uid)) {
      let PaletteColorLookupTableUID = entry.uid;
      if (this.entries.hasOwnProperty(PaletteColorLookupTableUID) !== true) {
        this.count++; // increment cache entry count...
      }
      entry.time = Date.now();
      this.entries[PaletteColorLookupTableUID] = entry;
      // @TODO: Add logic to get rid of old entries and reduce memory usage...
    }
  },
};

const WADOProxy = {
  convertURL: (url, server) => {
    // TODO: Remove all WADOProxy stuff from this file
    return url;
  },
};

class UIDSpecificMetadataProvider {
  constructor() {
    // Define the main "metadataLookup" private property as an immutable property.
    Object.defineProperty(this, 'studies', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: new Map(),
    });
    Object.defineProperty(this, 'imageIdToUids', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: new Map(),
    });
  }

  async addInstance(dicomJSONDatasetOrP10ArrayBuffer, options = {}) {
    let dicomJSONDataset;

    // If Arraybuffer, parse to DICOMJSON before naturalizing.
    if (dicomJSONDatasetOrP10ArrayBuffer instanceof ArrayBuffer) {
      const dicomData = DicomMessage.readFile(dicomJSONDatasetOrP10ArrayBuffer);

      dicomJSONDataset = dicomData.dict;
    } else {
      dicomJSONDataset = dicomJSONDatasetOrP10ArrayBuffer;
    }

    const naturalizedDataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
      dicomJSONDataset
    );

    const {
      StudyInstanceUID,
      SeriesInstanceUID,
      SOPInstanceUID,
    } = naturalizedDataset;

    const study = this._getAndCacheStudy(StudyInstanceUID);
    const series = this._getAndCacheSeriesFromStudy(study, SeriesInstanceUID);
    const instance = this._getAndCacheInstanceFromStudy(series, SOPInstanceUID);

    Object.assign(instance, naturalizedDataset);

    if (options.server) {
      await this._checkBulkDataAndInlineBinaries(instance, options.server);
    }

    return instance;
  }

  addImageIdToUids(imageId, uids) {
    // This method is a fallback for when you don't have WADO-URI or WADO-RS.
    // You can add instances fetched by any method by calling addInstance, and hook an imageId to point at it here.
    // An example would be dicom hosted at some random site.

    this.imageIdToUids.set(imageId, uids);
  }

  _getAndCacheStudy(StudyInstanceUID) {
    const studies = this.studies;

    let study = studies.get(StudyInstanceUID);

    if (!study) {
      study = { series: new Map() };
      studies.set(StudyInstanceUID, study);
    }

    return study;
  }
  _getAndCacheSeriesFromStudy(study, SeriesInstanceUID) {
    let series = study.series.get(SeriesInstanceUID);

    if (!series) {
      series = { instances: new Map() };
      study.series.set(SeriesInstanceUID, series);
    }

    return series;
  }

  _getAndCacheInstanceFromStudy(series, SOPInstanceUID) {
    let instance = series.instances.get(SOPInstanceUID);

    if (!instance) {
      instance = {};
      series.instances.set(SOPInstanceUID, instance);
    }

    return instance;
  }

  async _checkBulkDataAndInlineBinaries(instance, server) {
    await this._checkOverlayData(instance, server);

    if (instance.PhotometricInterpretation === 'PALETTE COLOR') {
      await this._checkPaletteColorLookupTableData(instance, server);
    }
  }

  async _checkPaletteColorLookupTableData(instance, server) {
    const {
      PaletteColorLookupTableUID,
      RedPaletteColorLookupTableDescriptor,
      GreenPaletteColorLookupTableDescriptor,
      BluePaletteColorLookupTableDescriptor,
      RedPaletteColorLookupTableData,
      GreenPaletteColorLookupTableData,
      BluePaletteColorLookupTableData,
    } = instance;

    return new Promise((resolve, reject) => {
      let entry;
      if (paletteColorCache.isValidUID(PaletteColorLookupTableUID)) {
        entry = paletteColorCache.get(PaletteColorLookupTableUID);

        if (entry) {
          return resolve(entry);
        }
      }

      // no entry in cache... Fetch remote data.
      const promises = [
        this.getPaletteColor(
          server,
          RedPaletteColorLookupTableData,
          RedPaletteColorLookupTableDescriptor
        ),
        this.getPaletteColor(
          server,
          GreenPaletteColorLookupTableData,
          GreenPaletteColorLookupTableDescriptor
        ),
        this.getPaletteColor(
          server,
          BluePaletteColorLookupTableData,
          BluePaletteColorLookupTableDescriptor
        ),
      ];

      Promise.all(promises).then(
        ([
          RedPaletteColorLookupTableData,
          GreenPaletteColorLookupTableData,
          BluePaletteColorLookupTableData,
        ]) => {
          // when PaletteColorLookupTableUID is present, the entry can be cached...
          paletteColorCache.add({
            RedPaletteColorLookupTableData,
            GreenPaletteColorLookupTableData,
            BluePaletteColorLookupTableData,
            PaletteColorLookupTableUID,
          });

          instance.RedPaletteColorLookupTableData = RedPaletteColorLookupTableData;
          instance.GreenPaletteColorLookupTableData = GreenPaletteColorLookupTableData;
          instance.BluePaletteColorLookupTableData = BluePaletteColorLookupTableData;

          resolve();
        }
      );
    });
  }

  getPaletteColor(server, paletteColorLookupTableData, lutDescriptor) {
    const numLutEntries = lutDescriptor[0];
    const bits = lutDescriptor[2];

    const readUInt16 = (byteArray, position) => {
      return byteArray[position] + byteArray[position + 1] * 256;
    };

    const arrayBufferToPaletteColorLUT = arraybuffer => {
      const byteArray = new Uint8Array(arraybuffer);
      const lut = [];

      if (bits === 16) {
        for (let i = 0; i < numLutEntries; i++) {
          lut[i] = readUInt16(byteArray, i * 2);
        }
      } else {
        for (let i = 0; i < numLutEntries; i++) {
          lut[i] = byteArray[i];
        }
      }

      return lut;
    };

    if (paletteColorLookupTableData.BulkDataURI) {
      let uri = WADOProxy.convertURL(
        paletteColorLookupTableData.BulkDataURI,
        server
      );

      // TODO: Workaround for dcm4chee behind SSL-terminating proxy returning
      // incorrect bulk data URIs
      if (server.wadoRoot.indexOf('https') === 0 && !uri.includes('https')) {
        uri = uri.replace('http', 'https');
      }

      const config = {
        url: server.wadoRoot, //BulkDataURI is absolute, so this isn't used
        headers: DICOMWeb.getAuthorizationHeader(server),
      };
      const dicomWeb = new api.DICOMwebClient(config);
      const options = {
        BulkDataURI: uri,
      };

      return dicomWeb
        .retrieveBulkData(options)
        .then(result => result[0])
        .then(arrayBufferToPaletteColorLUT);
    } else if (paletteColorLookupTableData.InlineBinary) {
      const inlineBinaryData = atob(paletteColorLookupTableData.InlineBinary);
      const arraybuffer = _str2ab(inlineBinaryData);

      return new Promise(resolve => {
        resolve(arrayBufferToPaletteColorLUT(arraybuffer));
      });
    }

    throw new Error(
      'Palette Color LUT was not provided as InlineBinary or BulkDataURI'
    );
  }

  async _checkOverlayData(instance, server) {
    const OverlayDataPromises = [];
    const OverlayDataTags = [];

    return new Promise((resolve, reject) => {
      for (
        let overlayGroup = 0x00;
        overlayGroup <= 0x1e;
        overlayGroup += 0x02
      ) {
        let groupStr = `60${overlayGroup.toString(16)}`;

        if (groupStr.length === 3) {
          groupStr = `600${overlayGroup.toString(16)}`;
        }

        const OverlayDataTag = `${groupStr}3000`;

        if (instance[OverlayDataTag] && instance[OverlayDataTag].BulkDataURI) {
          OverlayDataPromises.push(
            this._getOverlayData(instance[OverlayDataTag], server)
          );
          OverlayDataTags.push(OverlayDataTag);
        }
      }

      if (OverlayDataPromises.length) {
        Promise.all(OverlayDataPromises).then(results => {
          for (let i = 0; i < results.length; i++) {
            instance[OverlayDataTags[i]] = results[i];
          }

          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async _getOverlayData(tag, server) {
    const { BulkDataURI } = tag;

    let uri = WADOProxy.convertURL(BulkDataURI, server);

    // TODO: Workaround for dcm4chee behind SSL-terminating proxy returning
    // incorrect bulk data URIs
    if (server.wadoRoot.indexOf('https') === 0 && !uri.includes('https')) {
      uri = uri.replace('http', 'https');
    }

    const config = {
      url: server.wadoRoot, //BulkDataURI is absolute, so this isn't used
      headers: DICOMWeb.getAuthorizationHeader(server),
    };
    const dicomWeb = new api.DICOMwebClient(config);
    const options = {
      BulkDataURI: uri,
    };

    return dicomWeb
      .retrieveBulkData(options)
      .then(result => result[0])
      .then(_unpackOverlay);
  }

  _getInstance(imageId) {
    const uids = this._getUIDsFromImageID(imageId);

    if (!uids) {
      return;
    }

    const { StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID } = uids;

    return this._getInstanceData(
      StudyInstanceUID,
      SeriesInstanceUID,
      SOPInstanceUID
    );
  }

  get(query, imageId, options = { fallback: false }) {
    const instance = this._getInstance(imageId);

    if (query === 'instance') {
      return instance;
    }

    return this.getTagFromInstance(query, instance, options);
  }

  getTagFromInstance(
    naturalizedTagOrWADOImageLoaderTag,
    instance,
    options = { fallback: false }
  ) {
    if (!instance) {
      return;
    }

    // If its a naturalized dcmjs tag present on the instance, return.
    if (instance[naturalizedTagOrWADOImageLoaderTag]) {
      return instance[naturalizedTagOrWADOImageLoaderTag];
    }

    if (options.fallback) {
      // Perhaps the tag has fallbacks?
      const fallbackTag = getFallbackTagFromInstance(
        naturalizedTagOrWADOImageLoaderTag,
        instance
      );

      if (fallbackTag) {
        return fallbackTag;
      }
    }

    // Maybe its a legacy CornerstoneWADOImageLoader tag then:
    return this._getCornerstoneWADOImageLoaderTag(
      naturalizedTagOrWADOImageLoaderTag,
      instance
    );
  }

  _getCornerstoneWADOImageLoaderTag(wadoImageLoaderTag, instance) {
    let metadata;

    switch (wadoImageLoaderTag) {
      case WADO_IMAGE_LOADER_TAGS.GENERAL_SERIES_MODULE:
        const { SeriesDate, SeriesTime } = instance;

        let seriesDate;
        let seriesTime;

        if (SeriesDate) {
          seriesDate = dicomParser.parseDA(SeriesDate);
        }

        if (SeriesTime) {
          seriesTime = dicomParser.parseTM(SeriesTime);
        }

        metadata = {
          modality: instance.Modality,
          seriesInstanceUID: instance.SeriesInstanceUID,
          seriesNumber: instance.SeriesNumber,
          studyInstanceUID: instance.StudyInstanceUID,
          seriesDate,
          seriesTime,
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.PATIENT_STUDY_MODULE:
        metadata = {
          patientAge: instance.PatientAge,
          patientSize: instance.PatientSize,
          patientWeight: instance.PatientWeight,
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.IMAGE_PLANE_MODULE:
        const { ImageOrientationPatient } = instance;

        // Fallback for DX images.
        const PixelSpacing = getFallbackTagFromInstance(
          'PixelSpacing',
          instance
        );

        let rowPixelSpacing;
        let columnPixelSpacing;

        let rowCosines;
        let columnCosines;

        if (PixelSpacing) {
          rowPixelSpacing = PixelSpacing[0];
          columnPixelSpacing = PixelSpacing[1];
        }

        if (ImageOrientationPatient) {
          rowCosines = ImageOrientationPatient.slice(0, 3);
          columnCosines = ImageOrientationPatient.slice(3, 6);
        }

        metadata = {
          frameOfReferenceUID: instance.FrameOfReferenceUID,
          rows: instance.Rows,
          columns: instance.Columns,
          imageOrientationPatient: ImageOrientationPatient,
          rowCosines,
          columnCosines,
          imagePositionPatient: instance.ImagePositionPatient,
          sliceThickness: instance.SliceThickness,
          sliceLocation: instance.SliceLocation,
          pixelSpacing: PixelSpacing,
          rowPixelSpacing,
          columnPixelSpacing,
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.IMAGE_PIXEL_MODULE:
        metadata = {
          samplesPerPixel: instance.SamplesPerPixel,
          photometricInterpretation: instance.PhotometricInterpretation,
          rows: instance.Rows,
          columns: instance.Columns,
          bitsAllocated: instance.BitsAllocated,
          bitsStored: instance.BitsStored,
          highBit: instance.HighBit,
          pixelRepresentation: instance.PixelRepresentation,
          planarConfiguration: instance.PlanarConfiguration,
          pixelAspectRatio: instance.PixelAspectRatio,
          smallestPixelValue: instance.SmallestPixelValue,
          largestPixelValue: instance.LargestPixelValue,
          redPaletteColorLookupTableDescriptor:
            instance.RedPaletteColorLookupTableDescriptor,
          greenPaletteColorLookupTableDescriptor:
            instance.GreenPaletteColorLookupTableDescriptor,
          bluePaletteColorLookupTableDescriptor:
            instance.BluePaletteColorLookupTableDescriptor,
          redPaletteColorLookupTableData:
            instance.RedPaletteColorLookupTableData,
          greenPaletteColorLookupTableData:
            instance.GreenPaletteColorLookupTableData,
          bluePaletteColorLookupTableData:
            instance.BluePaletteColorLookupTableData,
        };

        break;
      case WADO_IMAGE_LOADER_TAGS.VOI_LUT_MODULE:
        const { WindowCenter, WindowWidth } = instance;

        const windowCenter = Array.isArray(WindowCenter)
          ? WindowCenter
          : [WindowCenter];
        const windowWidth = Array.isArray(WindowWidth)
          ? WindowWidth
          : [WindowWidth];

        metadata = {
          windowCenter,
          windowWidth,
        };

        break;
      case WADO_IMAGE_LOADER_TAGS.MODALITY_LUT_MODULE:
        metadata = {
          rescaleIntercept: instance.RescaleIntercept,
          rescaleSlope: instance.RescaleSlope,
          rescaleType: instance.RescaleType,
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.SOP_COMMON_MODULE:
        metadata = {
          sopClassUID: instance.SOPClassUID,
          sopInstanceUID: instance.SOPInstanceUID,
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.PET_ISOTOPE_MODULE:
        const { RadiopharmaceuticalInformationSequence } = instance;

        if (RadiopharmaceuticalInformationSequence) {
          const RadiopharmaceuticalInformation = Array.isArray(
            RadiopharmaceuticalInformationSequence
          )
            ? RadiopharmaceuticalInformationSequence[0]
            : RadiopharmaceuticalInformationSequence;

          const {
            RadiopharmaceuticalStartTime,
            RadionuclideTotalDose,
            RadionuclideHalfLife,
          } = RadiopharmaceuticalInformation;

          const radiopharmaceuticalInfo = {
            radiopharmaceuticalStartTime: dicomParser.parseTM(
              RadiopharmaceuticalStartTime
            ),
            radionuclideTotalDose: RadionuclideTotalDose,
            radionuclideHalfLife: RadionuclideHalfLife,
          };
          metadata = {
            radiopharmaceuticalInfo,
          };
        }

        break;
      case WADO_IMAGE_LOADER_TAGS.OVELAY_PLANE_MODULE:
        metadata = [];

        for (
          let overlayGroup = 0x00;
          overlayGroup <= 0x1e;
          overlayGroup += 0x02
        ) {
          let groupStr = `60${overlayGroup.toString(16)}`;

          if (groupStr.length === 3) {
            groupStr = `600${overlayGroup.toString(16)}`;
          }

          const OverlayDataTag = `${groupStr}3000`;
          const OverlayData = instance[OverlayDataTag];

          if (!OverlayData) {
            continue;
          }

          const OverlayRowsTag = `${groupStr}0010`;
          const OverlayColumnsTag = `${groupStr}0011`;
          const OverlayType = `${groupStr}0040`;
          const OverlayOriginTag = `${groupStr}0050`;
          const OverlayDescriptionTag = `${groupStr}0022`;
          const OverlayLabelTag = `${groupStr}1500`;
          const ROIAreaTag = `${groupStr}1301`;
          const ROIMeanTag = `${groupStr}1302`;
          const ROIStandardDeviationTag = `${groupStr}1303`;
          const OverlayOrigin = instance[OverlayOriginTag];

          const overlay = {
            rows: instance[OverlayRowsTag],
            columns: instance[OverlayColumnsTag],
            type: instance[OverlayType],
            x: OverlayOrigin[0],
            y: OverlayOrigin[1],
            pixelData: OverlayData,
            description: instance[OverlayDescriptionTag],
            label: instance[OverlayLabelTag],
            roiArea: instance[ROIAreaTag],
            roiMean: instance[ROIMeanTag],
            roiStandardDeviation: instance[ROIStandardDeviationTag],
          };

          metadata.push(overlay);
        }

        break;

      case WADO_IMAGE_LOADER_TAGS.PATIENT_MODULE:
        const { PatientName } = instance;

        let patientName;
        if (PatientName) {
          patientName = PatientName.Alphabetic;
        }

        metadata = {
          patientName,
          patientId: instance.PatientID,
        };

        break;

      case WADO_IMAGE_LOADER_TAGS.GENERAL_IMAGE_MODULE:
        metadata = {
          instanceNumber: instance.InstanceNumber,
          lossyImageCompression: instance.LossyImageCompression,
          lossyImageCompressionRatio: instance.LossyImageCompressionRatio,
          lossyImageCompressionMethod: instance.LossyImageCompressionMethod,
        };

        break;
      case WADO_IMAGE_LOADER_TAGS.GENERAL_STUDY_MODULE:
        metadata = {
          studyDescription: instance.StudyDescription,
          studyDate: instance.StudyDate,
          studyTime: instance.StudyTime,
          accessionNumber: instance.AccessionNumber,
        };

        break;
      case WADO_IMAGE_LOADER_TAGS.CINE_MODULE:
        metadata = {
          frameTime: instance.FrameTime,
        };

        break;
    }

    return metadata;
  }

  _getInstanceData(StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID) {
    const study = this.studies.get(StudyInstanceUID);

    if (!study) {
      return;
    }

    const series = study.series.get(SeriesInstanceUID);

    if (!series) {
      return;
    }

    const instance = series.instances.get(SOPInstanceUID);

    return instance;
  }

  _getUIDsFromImageID(imageId) {
    if (imageId.includes('wadors:')) {
      const strippedImageId = imageId.split('studies/')[1];
      const splitImageId = strippedImageId.split('/');

      return {
        StudyInstanceUID: splitImageId[0], // Note: splitImageId[1] === 'series'
        SeriesInstanceUID: splitImageId[2], // Note: splitImageId[3] === 'instances'
        SOPInstanceUID: splitImageId[4],
      };
    }
    if (imageId.includes('wado?requestType=WADO')) {
      const qs = queryString.parse(imageId);

      return {
        StudyInstanceUID: qs.studyUID,
        SeriesInstanceUID: qs.seriesUID,
        SOPInstanceUID: qs.objectUID,
      };
    } else {
      // Maybe its a non-standard imageId
      return this.imageIdToUids.get(imageId);
    }
  }
}

const uidSpecificMetadataProvider = new UIDSpecificMetadataProvider();

export default uidSpecificMetadataProvider;

const WADO_IMAGE_LOADER_TAGS = {
  // CornerstoneWADOImageLoader specific
  GENERAL_SERIES_MODULE: 'generalSeriesModule',
  PATIENT_STUDY_MODULE: 'patientStudyModule',

  IMAGE_PLANE_MODULE: 'imagePlaneModule',
  IMAGE_PIXEL_MODULE: 'imagePixelModule',
  VOI_LUT_MODULE: 'voiLutModule',
  MODALITY_LUT_MODULE: 'modalityLutModule',
  SOP_COMMON_MODULE: 'sopCommonModule',
  PET_ISOTOPE_MODULE: 'petIsotopeModule',
  OVELAY_PLANE_MODULE: 'overlayPlaneModule',
  // react-cornerstone-viewport specifc
  PATIENT_MODULE: 'patientModule',
  GENERAL_IMAGE_MODULE: 'generalImageModule',
  GENERAL_STUDY_MODULE: 'generalStudyModule',
  CINE_MODULE: 'cineModule',
};

function _unpackOverlay(arrayBuffer) {
  const bitArray = new Uint8Array(arrayBuffer);
  const byteArray = new Uint8Array(8 * bitArray.length);

  for (let byteIndex = 0; byteIndex < byteArray.length; byteIndex++) {
    const bitIndex = byteIndex % 8;
    const bitByteIndex = Math.floor(byteIndex / 8);
    byteArray[byteIndex] =
      1 * ((bitArray[bitByteIndex] & (1 << bitIndex)) >> bitIndex);
  }

  return byteArray;
}

/**
 * Convert String to ArrayBuffer
 *
 * @param {String} str Input String
 * @return {ArrayBuffer} Output converted ArrayBuffer
 */
function _str2ab(str) {
  const strLen = str.length;
  const bytes = new Uint8Array(strLen);

  for (let i = 0; i < strLen; i++) {
    bytes[i] = str.charCodeAt(i);
  }

  return bytes.buffer;
}
