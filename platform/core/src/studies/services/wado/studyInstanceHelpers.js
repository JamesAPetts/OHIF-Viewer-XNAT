import { api } from 'dicomweb-client';
import DICOMWeb from '../../../DICOMWeb';
import uidSpecificMetadataProvider from '../../../classes/UIDSpecificMetadataProvider';
import getWADORSImageId from '../../../utils/getWADORSImageId';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import { getWadoRsInstanceMetaData } from './updateMetadataManager';

const WADOProxy = {
  convertURL: (url, server) => {
    // TODO: Remove all WADOProxy stuff from this file
    return url;
  },
};
function parseFloatArray(obj) {
  const result = [];

  if (!obj) {
    return result;
  }

  const objs = obj.split('\\');
  for (let i = 0; i < objs.length; i++) {
    result.push(parseFloat(objs[i]));
  }

  return result;
}

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

/**
 * Create a plain JS object that describes a study (a study descriptor object)
 * @param {Object} server Object with server configuration parameters
 * @param {Object} aSopInstance a SOP Instance from which study information will be added
 */
function createStudy(server, aSopInstance) {
  // TODO: Pass a reference ID to the server instead of including the URLs here
  return {
    seriesList: [],
    seriesMap: Object.create(null),
    seriesLoader: null,
    wadoUriRoot: server.wadoUriRoot,
    wadoRoot: server.wadoRoot,
    qidoRoot: server.qidoRoot,
    PatientName: DICOMWeb.getName(aSopInstance['00100010']),
    PatientId: DICOMWeb.getString(aSopInstance['00100020']),
    PatientAge: DICOMWeb.getNumber(aSopInstance['00101010']),
    PatientSize: DICOMWeb.getNumber(aSopInstance['00101020']),
    PatientWeight: DICOMWeb.getNumber(aSopInstance['00101030']),
    AccessionNumber: DICOMWeb.getString(aSopInstance['00080050']),
    StudyDate: DICOMWeb.getString(aSopInstance['00080020']),
    modalities: DICOMWeb.getString(aSopInstance['00080061']), // TODO -> Rename this.. it'll take a while to not mess this one up.
    StudyDescription: DICOMWeb.getString(aSopInstance['00081030']),
    NumberOfStudyRelatedInstances: DICOMWeb.getString(aSopInstance['00201208']),
    StudyInstanceUID: DICOMWeb.getString(aSopInstance['0020000D']),
    InstitutionName: DICOMWeb.getString(aSopInstance['00080080']),
  };
}

/** Returns a WADO url for an instance
 *
 * @param StudyInstanceUID
 * @param SeriesInstanceUID
 * @param SOPInstanceUID
 * @returns  {string}
 */
function buildInstanceWadoUrl(
  server,
  StudyInstanceUID,
  SeriesInstanceUID,
  SOPInstanceUID
) {
  // TODO: This can be removed, since DICOMWebClient has the same function. Not urgent, though
  const params = [];

  params.push('requestType=WADO');
  params.push(`studyUID=${StudyInstanceUID}`);
  params.push(`seriesUID=${SeriesInstanceUID}`);
  params.push(`objectUID=${SOPInstanceUID}`);
  params.push('contentType=application/dicom');
  params.push('transferSyntax=*');

  const paramString = params.join('&');

  return `${server.wadoUriRoot}?${paramString}`;
}

function buildInstanceWadoRsUri(
  server,
  StudyInstanceUID,
  SeriesInstanceUID,
  SOPInstanceUID
) {
  return `${server.wadoRoot}/studies/${StudyInstanceUID}/series/${SeriesInstanceUID}/instances/${SOPInstanceUID}`;
}

function buildInstanceFrameWadoRsUri(
  server,
  StudyInstanceUID,
  SeriesInstanceUID,
  SOPInstanceUID,
  frame
) {
  const baseWadoRsUri = buildInstanceWadoRsUri(
    server,
    StudyInstanceUID,
    SeriesInstanceUID,
    SOPInstanceUID
  );
  frame = frame != null || 1;

  return `${baseWadoRsUri}/frames/${frame}`;
}

function getFrameIncrementPointer(element) {
  const frameIncrementPointerNames = {
    '00181065': 'FrameTimeVector',
    '00181063': 'FrameTime',
  };

  if (!element || !element.Value || !element.Value.length) {
    return;
  }

  const value = element.Value[0];
  return frameIncrementPointerNames[value];
}

function getRadiopharmaceuticalInfo(naturalizedInstance) {
  const { RadiopharmaceuticalInformationSequence } = naturalizedInstance;

  if (RadiopharmaceuticalInformationSequence) {
    //debugger;
    return Array.isArray(RadiopharmaceuticalInformationSequence)
      ? RadiopharmaceuticalInformationSequence[0]
      : RadiopharmaceuticalInformationSequence;
  }
}

async function makeSOPInstance(server, study, instance) {
  const naturalizedInstance = uidSpecificMetadataProvider.addInstance(
    instance,
    {
      server,
    }
  );

  const {
    StudyInstanceUID,
    SeriesInstanceUID,
    SOPInstanceUID,
  } = naturalizedInstance;

  let series = study.seriesMap[SeriesInstanceUID];

  if (!series) {
    series = {
      SeriesInstanceUID,
      SeriesDescription: naturalizedInstance.SeriesDescription,
      Modality: naturalizedInstance.Modality,
      SeriesNumber: naturalizedInstance.SeriesNumber,
      SeriesDate: naturalizedInstance.SeriesDate,
      SeriesTime: naturalizedInstance.SeriesTime,
      instances: [],
    };
    study.seriesMap[SeriesInstanceUID] = series;
    study.seriesList.push(series);
  }

  // TODO -> Just use this instance metadata now.

  const wadouri = buildInstanceWadoUrl(
    server,
    StudyInstanceUID,
    SeriesInstanceUID,
    SOPInstanceUID
  );
  const baseWadoRsUri = buildInstanceWadoRsUri(
    server,
    StudyInstanceUID,
    SeriesInstanceUID,
    SOPInstanceUID
  );
  const wadorsuri = buildInstanceFrameWadoRsUri(
    server,
    StudyInstanceUID,
    SeriesInstanceUID,
    SOPInstanceUID
    // TODO -> Shouldn't this have frame? Doesn't on master.
  );

  // TODO -> eventually replace this whole thing if possible.

  const sopInstance = {
    ImageType: naturalizedInstance.ImageType,
    SOPClassUID: naturalizedInstance.SOPClassUID,
    Modality: naturalizedInstance.Modality,
    SOPInstanceUID,
    InstanceNumber: naturalizedInstance.InstanceNumber,
    ImagePositionPatient: naturalizedInstance.ImagePositionPatient,
    ImageOrientationPatient: naturalizedInstance.ImageOrientationPatient,
    FrameOfReferenceUID: naturalizedInstance.FrameOfReferenceUID,
    SliceLocation: naturalizedInstance.SliceLocation,
    SamplesPerPixel: naturalizedInstance.SamplesPerPixel,
    PhotometricInterpretation: naturalizedInstance.PhotometricInterpretation,
    PlanarConfiguration: naturalizedInstance.PlanarConfiguration,
    Rows: naturalizedInstance.Rows,
    Columns: naturalizedInstance.Columns,
    PixelSpacing: naturalizedInstance.PixelSpacing,
    PixelAspectRatio: naturalizedInstance.PixelAspectRatio,
    BitsAllocated: naturalizedInstance.BitsAllocated,
    BitsStored: naturalizedInstance.BitsStored,
    HighBit: naturalizedInstance.HighBit,
    PixelRepresentation: naturalizedInstance.PixelRepresentation,
    SmallestPixelValue: naturalizedInstance.SmallestPixelValue,
    LargestPixelValue: naturalizedInstance.LargestPixelValue,
    WindowCenter: naturalizedInstance.WindowCenter,
    WindowWidth: naturalizedInstance.WindowCenter,
    RescaleIntercept: naturalizedInstance.RescaleIntercept,
    RescaleSlope: naturalizedInstance.RescaleSlope,
    Laterality: naturalizedInstance.Laterality,
    ViewPosition: naturalizedInstance.ViewPosition,
    AcquisitionDateTime: naturalizedInstance.AcquisitionDateTime,
    NumberOfFrames: naturalizedInstance.NumberOfFrames,
    FrameIncrementPointer: getFrameIncrementPointer(instance['00280009']),
    FrameTime: naturalizedInstance.FrameTime,
    FrameTimeVector: parseFloatArray(naturalizedInstance.FrameTimeVector),
    SliceThickness: naturalizedInstance.SliceThickness,
    SpacingBetweenSlices: naturalizedInstance.SpacingBetweenSlices,
    LossyImageCompression: naturalizedInstance.LossyImageCompression,
    DerivationDescription: naturalizedInstance.DerivationDescription,
    LossyImageCompressionRatio: naturalizedInstance.LossyImageCompressionRatio,
    LossyImageCompressionMethod:
      naturalizedInstance.LossyImageCompressionMethod,
    EchoNumber: naturalizedInstance.EchoNumber,
    ContrastBolusAgent: naturalizedInstance.ContrastBolusAgent,
    RadiopharmaceuticalInfo: getRadiopharmaceuticalInfo(naturalizedInstance),
    baseWadoRsUri: baseWadoRsUri,
    wadouri: WADOProxy.convertURL(wadouri, server),
    wadorsuri: WADOProxy.convertURL(wadorsuri, server),
    wadoRoot: server.wadoRoot,
    imageRendering: server.imageRendering,
    thumbnailRendering: server.thumbnailRendering,
    getNaturalizedInstance: () => naturalizedInstance,
  };

  // Get additional information if the instance uses "PALETTE COLOR" photometric interpretation
  if (sopInstance.PhotometricInterpretation === 'PALETTE COLOR') {
    const RedPaletteColorLookupTableDescriptor = parseFloatArray(
      DICOMWeb.getString(instance['00281101'])
    );
    const GreenPaletteColorLookupTableDescriptor = parseFloatArray(
      DICOMWeb.getString(instance['00281102'])
    );
    const BluePaletteColorLookupTableDescriptor = parseFloatArray(
      DICOMWeb.getString(instance['00281103'])
    );
    const palettes = await getPaletteColors(
      server,
      instance,
      RedPaletteColorLookupTableDescriptor
    );

    if (palettes) {
      if (palettes.uid) {
        sopInstance.PaletteColorLookupTableUID = palettes.uid;
      }

      sopInstance.RedPaletteColorLookupTableData = palettes.red;
      sopInstance.GreenPaletteColorLookupTableData = palettes.green;
      sopInstance.BluePaletteColorLookupTableData = palettes.blue;
      sopInstance.RedPaletteColorLookupTableDescriptor = RedPaletteColorLookupTableDescriptor;
      sopInstance.GreenPaletteColorLookupTableDescriptor = GreenPaletteColorLookupTableDescriptor;
      sopInstance.BluePaletteColorLookupTableDescriptor = BluePaletteColorLookupTableDescriptor;
    }
  }

  series.instances.push(sopInstance);

  if (
    sopInstance.thumbnailRendering === 'wadors' ||
    sopInstance.imageRendering === 'wadors'
  ) {
    // If using WADO-RS for either images or thumbnails,
    // Need to add this to cornerstoneWADOImageLoader's provider.

    let wadoRSMetadata;

    // if (sopInstance.Modality === 'PT') {
    //debugger;

    const metadata = getWadoRsInstanceMetaData(study, series, sopInstance);

    wadoRSMetadata = Object.assign({}, metadata);

    console.log(wadoRSMetadata['00281050']);
    console.log(wadoRSMetadata['00281051']);

    //debugger;

    //debugger;
    // } else {
    //   wadoRSMetadata = Object.assign({}, instance);
    // }

    // TODO -> PET doesn't render.
    // add RadiopharmaceuticalInfo => As updateMetadataManager did.
    // Add colors

    //const RadiopharmaceuticalInfo = wadoRSMetadata['00540016'];

    if (sopInstance.NumberOfFrames) {
      for (let i = 0; i < sopInstance.NumberOfFrames; i++) {
        const wadorsImageId = getWADORSImageId(sopInstance, i);

        cornerstoneWADOImageLoader.wadors.metaDataManager.add(
          wadorsImageId,
          wadoRSMetadata
        );
      }
    } else {
      const wadorsImageId = getWADORSImageId(sopInstance);

      cornerstoneWADOImageLoader.wadors.metaDataManager.add(
        wadorsImageId,
        wadoRSMetadata
      );
    }
  }

  return sopInstance;
}

/**
 * Convert String to ArrayBuffer
 *
 * @param {String} str Input String
 * @return {ArrayBuffer} Output converted ArrayBuffer
 */
function str2ab(str) {
  const strLen = str.length;
  const bytes = new Uint8Array(strLen);

  for (let i = 0; i < strLen; i++) {
    bytes[i] = str.charCodeAt(i);
  }

  return bytes.buffer;
}

function getPaletteColor(server, instance, tag, lutDescriptor) {
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

  if (instance[tag].BulkDataURI) {
    let uri = WADOProxy.convertURL(instance[tag].BulkDataURI, server);

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
  } else if (instance[tag].InlineBinary) {
    const inlineBinaryData = atob(instance[tag].InlineBinary);
    const arraybuf = str2ab(inlineBinaryData);

    return arrayBufferToPaletteColorLUT(arraybuf);
  }

  throw new Error(
    'Palette Color LUT was not provided as InlineBinary or BulkDataURI'
  );
}

/**
 * Fetch palette colors for instances with "PALETTE COLOR" PhotometricInterpretation.
 *
 * @param server {Object} Current server;
 * @param instance {Object} The retrieved instance metadata;
 * @returns {String} The ReferenceSOPInstanceUID
 */
async function getPaletteColors(server, instance, lutDescriptor) {
  let PaletteColorLookupTableUID = DICOMWeb.getString(instance['00281199']);

  return new Promise((resolve, reject) => {
    let entry;
    if (paletteColorCache.isValidUID(PaletteColorLookupTableUID)) {
      entry = paletteColorCache.get(PaletteColorLookupTableUID);

      if (entry) {
        return resolve(entry);
      }
    }

    // no entry in cache... Fetch remote data.
    const r = getPaletteColor(server, instance, '00281201', lutDescriptor);
    const g = getPaletteColor(server, instance, '00281202', lutDescriptor);
    const b = getPaletteColor(server, instance, '00281203', lutDescriptor);

    const promises = [r, g, b];

    Promise.all(promises).then(args => {
      entry = {
        red: args[0],
        green: args[1],
        blue: args[2],
      };

      // when PaletteColorLookupTableUID is present, the entry can be cached...
      entry.uid = PaletteColorLookupTableUID;
      paletteColorCache.add(entry);

      resolve(entry);
    });
  });
}

/**
 * Add a list of SOP Instances to a given study object descriptor
 * @param {Object} server Object with server configuration parameters
 * @param {Object} study The study descriptor to which the given SOP instances will be added
 * @param {Array} sopInstanceList A list of SOP instance objects
 */
async function addInstancesToStudy(server, study, sopInstanceList) {
  return Promise.all(
    sopInstanceList.map(function(sopInstance) {
      return makeSOPInstance(server, study, sopInstance);
    })
  );
}

const createStudyFromSOPInstanceList = async (server, sopInstanceList) => {
  if (Array.isArray(sopInstanceList) && sopInstanceList.length > 0) {
    const firstSopInstance = sopInstanceList[0];
    const study = createStudy(server, firstSopInstance);
    await addInstancesToStudy(server, study, sopInstanceList);
    return study;
  }
  throw new Error('Failed to create study out of provided SOP instance list');
};

export { createStudyFromSOPInstanceList, addInstancesToStudy };
