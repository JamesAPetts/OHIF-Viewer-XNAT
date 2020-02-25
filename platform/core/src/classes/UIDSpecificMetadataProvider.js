import cornerstone from 'cornerstone-core';
import * as dcmjs from 'dcmjs';
import queryString from 'query-string';
import dicomParser from 'dicom-parser';

class UIDSpecificMetadataProvider {
  constructor() {
    // Define the main "metadataLookup" private property as an immutable property.
    Object.defineProperty(this, 'studies', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: new Map(),
    });
  }

  addMetadata(
    dicomJSONDataset,
    StudyInstanceUID,
    SeriesInstanceUID,
    SOPInstanceUID
  ) {
    const naturalizedDataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
      dicomJSONDataset
    );

    const study = this._getAndCacheStudy(StudyInstanceUID);
    const series = this._getAndCacheSeriesFromStudy(study, SeriesInstanceUID);
    const instance = this._getAndCacheInstanceFromStudy(series, SOPInstanceUID);

    Object.assign(instance, naturalizedDataset);
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

  getInstance(imageId) {
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

  get(naturalizedTagOrWADOImageLoaderTag, imageId) {
    if (naturalizedTagOrWADOImageLoaderTag === 'imagePlaneModule') {
      debugger;
    }

    const instance = this.getInstance(imageId);

    if (!instance) {
      return;
    }

    // If its a naturalized dcmjs tag, return.
    if (instance[naturalizedTagOrWADOImageLoaderTag]) {
      return instance[naturalizedTagOrWADOImageLoaderTag];
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
          patientWeight: instance.patientWeight,
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.IMAGE_PLANE_MODULE:
        const { ImageOrientationPatient, PixelSpacing } = instance;
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
        metadata = {
          windowCenter: instance.WindowCenter,
          windowWidth: instance.WindowWidth,
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
      // Unsupported imageId.
      return;
    }
  }
}

const uidSpecificMetadataProvider = new UIDSpecificMetadataProvider();

export default uidSpecificMetadataProvider;

const WADO_IMAGE_LOADER_TAGS = {
  GENERAL_SERIES_MODULE: 'generalSeriesModule',
  PATIENT_STUDY_MODULE: 'patientStudyModule',
  IMAGE_PLANE_MODULE: 'imagePlaneModule',
  IMAGE_PIXEL_MODULE: 'imagePixelModule',
  VOI_LUT_MODULE: 'voiLutModule',
  MODALITY_LUT_MODULE: 'modalityLutModule',
  SOP_COMMON_MODULE: 'sopCommonModule',
  PET_ISOTOPE_MODULE: 'petIsotopeModule',
  OVELAY_PLANE_MODULE: 'overlayPlaneModule',
};
