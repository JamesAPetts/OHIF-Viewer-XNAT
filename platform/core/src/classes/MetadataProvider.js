import { parsingUtils } from '../lib/parsingUtils';

const FUNCTION = 'function';

class MetadataProvider {
  constructor() {
    // Define the main "metadataLookup" private property as an immutable property.
    Object.defineProperty(this, 'metadataLookup', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: new Map(),
    });

    // Local reference to provider function bound to current instance.
    Object.defineProperty(this, '_provider', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: null,
    });
  }

  /**
   * Cornerstone Metadata provider to store image meta data
   * Data from instances, series, and studies are associated with
   * imageIds to facilitate usage of this information by Cornerstone's Tools
   *
   * e.g. the imagePlane metadata object contains instance information about
   * row/column pixel spacing, patient position, and patient orientation. It
   * is used in CornerstoneTools to position reference lines and orientation markers.
   *
   * @param {String} imageId The Cornerstone ImageId
   * @param {Object} data An object containing instance, series, and study metadata
   */
  addMetadata(imageId, data) {
    const instanceMetadata = data.instance;
    const seriesMetadata = data.series;
    const studyMetadata = data.study;
    const numImages = data.numImages;
    const metadata = {};

    metadata.frameNumber = data.frameNumber;

    metadata.study = {
      accessionNumber: studyMetadata.accessionNumber,
      patientId: studyMetadata.patientId,
      studyInstanceUid: studyMetadata.studyInstanceUid,
      studyDate: studyMetadata.studyDate,
      studyTime: studyMetadata.studyTime,
      studyDescription: studyMetadata.studyDescription,
      institutionName: studyMetadata.institutionName,
      patientHistory: studyMetadata.patientHistory,
    };

    metadata.series = {
      seriesDescription: seriesMetadata.seriesDescription,
      seriesNumber: seriesMetadata.seriesNumber,
      seriesDate: seriesMetadata.seriesDate,
      seriesTime: seriesMetadata.seriesTime,
      modality: seriesMetadata.modality,
      seriesInstanceUid: seriesMetadata.seriesInstanceUid,
      numImages: numImages,
    };

    metadata.instance = instanceMetadata;

    metadata.patient = {
      name: studyMetadata.patientName,
      id: studyMetadata.patientId,
      birthDate: studyMetadata.patientBirthDate,
      sex: studyMetadata.patientSex,
      age: studyMetadata.patientAge,
    };

    // If there is sufficient information, populate
    // the imagePlane object for easier use in the Viewer
    metadata.imagePlane = this.getImagePlane(instanceMetadata);

    // Add the metadata to the imageId lookup object
    this.metadataLookup.set(imageId, metadata);
  }

  /**
   * Constructs and returns the imagePlane given the metadata instance
   *
   * @param metadataInstance The metadata instance (InstanceMetadata class) containing information to construct imagePlane
   * @returns imagePlane The constructed imagePlane to be used in viewer easily
   */
  getImagePlane(instance) {
    if (
      !instance.rows ||
      !instance.columns ||
      !instance.pixelSpacing ||
      !instance.frameOfReferenceUID ||
      !instance.imageOrientationPatient ||
      !instance.imagePositionPatient
    ) {
      return;
    }

    const imageOrientation = instance.imageOrientationPatient.split('\\');
    const imagePosition = instance.imagePositionPatient.split('\\');

    let columnPixelSpacing = 1.0;
    let rowPixelSpacing = 1.0;
    if (instance.pixelSpacing) {
      const split = instance.pixelSpacing.split('\\');
      rowPixelSpacing = parseFloat(split[0]);
      columnPixelSpacing = parseFloat(split[1]);
    }

    return {
      frameOfReferenceUID: instance.frameOfReferenceUID,
      rows: instance.rows,
      columns: instance.columns,
      rowCosines: [
        parseFloat(imageOrientation[0]),
        parseFloat(imageOrientation[1]),
        parseFloat(imageOrientation[2]),
      ],
      columnCosines: [
        parseFloat(imageOrientation[3]),
        parseFloat(imageOrientation[4]),
        parseFloat(imageOrientation[5]),
      ],
      imagePositionPatient: [
        parseFloat(imagePosition[0]),
        parseFloat(imagePosition[1]),
        parseFloat(imagePosition[2]),
      ],
      rowPixelSpacing,
      columnPixelSpacing,
    };
  }

  /**
   * Get a bound reference to the provider function.
   */
  getProvider() {
    let provider = this._provider;
    if (typeof this._provider !== FUNCTION) {
      provider = this.provider.bind(this);
      this._provider = provider;
    }

    return provider;
  }

  /**
   * Looks up metadata for Cornerstone Tools given a specified type and imageId
   * A type may be, e.g. 'study', or 'patient', or 'imagePlaneModule'. These types
   * are keys in the stored metadata objects.
   *
   * @param type
   * @param imageId
   * @returns {Object} Relevant metadata of the specified type
   */
  provider(type, imageId) {
    const imageMetadata = this.metadataLookup.get(imageId);
    if (!imageMetadata) {
      return;
    }

    if (imageMetadata.hasOwnProperty(type)) {
      debugger;
      return imageMetadata[type];
    }
  }
}

export default MetadataProvider;
