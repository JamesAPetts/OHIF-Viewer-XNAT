import { api } from 'dicomweb-client';
import DICOMWeb from '../../../DICOMWeb';
import uidSpecificMetadataProvider from '../../../classes/UIDSpecificMetadataProvider';

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

function getRadiopharmaceuticalInfo(instance) {
  const Modality = DICOMWeb.getString(instance['00080060']);

  if (Modality !== 'PT') {
    return;
  }

  const RadiopharmaceuticalInfo = instance['00540016'];
  if (
    RadiopharmaceuticalInfo === undefined ||
    !RadiopharmaceuticalInfo.Value ||
    !RadiopharmaceuticalInfo.Value.length
  ) {
    return;
  }

  const firstPetRadiopharmaceuticalInfo = RadiopharmaceuticalInfo.Value[0];
  return {
    RadiopharmaceuticalStartTime: DICOMWeb.getString(
      firstPetRadiopharmaceuticalInfo['00181072']
    ),
    RadionuclideTotalDose: DICOMWeb.getNumber(
      firstPetRadiopharmaceuticalInfo['00181074']
    ),
    RadionuclideHalfLife: DICOMWeb.getNumber(
      firstPetRadiopharmaceuticalInfo['00181075']
    ),
  };
}

/**
 * Parses the SourceImageSequence, if it exists, in order
 * to return a ReferenceSOPInstanceUID. The ReferenceSOPInstanceUID
 * is used to refer to this image in any accompanying DICOM-SR documents.
 *
 * @param instance
 * @returns {String} The ReferenceSOPInstanceUID
 */
function getSourceImageInstanceUid(instance) {
  // TODO= Parse the whole Source Image Sequence
  // This is a really poor workaround for now.
  // Later we should probably parse the whole sequence.
  var SourceImageSequence = instance['00082112'];
  if (
    SourceImageSequence &&
    SourceImageSequence.Value &&
    SourceImageSequence.Value.length &&
    SourceImageSequence.Value[0]['00081155'].Value
  ) {
    return SourceImageSequence.Value[0]['00081155'].Value[0];
  }
}

async function makeSOPInstance(server, study, instance) {
  const { StudyInstanceUID } = study;
  const SeriesInstanceUID = DICOMWeb.getString(instance['0020000E']);
  let series = study.seriesMap[SeriesInstanceUID];

  if (!series) {
    series = {
      SeriesInstanceUID,
      SeriesDescription: DICOMWeb.getString(instance['0008103E']),
      Modality: DICOMWeb.getString(instance['00080060']),
      SeriesNumber: DICOMWeb.getNumber(instance['00200011']),
      SeriesDate: DICOMWeb.getString(instance['00080021']),
      SeriesTime: DICOMWeb.getString(instance['00080031']),
      instances: [],
    };
    study.seriesMap[SeriesInstanceUID] = series;
    study.seriesList.push(series);
  }

  const SOPInstanceUID = DICOMWeb.getString(instance['00080018']);

  if (!instance) {
    debugger;
  }

  uidSpecificMetadataProvider.addMetadata(instance, { server });

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
  );

  const sopInstance = {
    ImageType: DICOMWeb.getString(instance['00080008']),
    SOPClassUID: DICOMWeb.getString(instance['00080016']),
    Modality: DICOMWeb.getString(instance['00080060']),
    SOPInstanceUID,
    InstanceNumber: DICOMWeb.getNumber(instance['00200013']),
    ImagePositionPatient: DICOMWeb.getString(instance['00200032']),
    imageOrientationPatient: DICOMWeb.getString(instance['00200037']),
    FrameOfReferenceUID: DICOMWeb.getString(instance['00200052']),
    SliceLocation: DICOMWeb.getNumber(instance['00201041']),
    SamplesPerPixel: DICOMWeb.getNumber(instance['00280002']),
    PhotometricInterpretation: DICOMWeb.getString(instance['00280004']),
    PlanarConfiguration: DICOMWeb.getNumber(instance['00280006']),
    Rows: DICOMWeb.getNumber(instance['00280010']),
    Columns: DICOMWeb.getNumber(instance['00280011']),
    PixelSpacing: DICOMWeb.getString(instance['00280030']),
    PixelAspectRatio: DICOMWeb.getString(instance['00280034']),
    BitsAllocated: DICOMWeb.getNumber(instance['00280100']),
    BitsStored: DICOMWeb.getNumber(instance['00280101']),
    HighBit: DICOMWeb.getNumber(instance['00280102']),
    PixelRepresentation: DICOMWeb.getNumber(instance['00280103']),
    SmallestPixelValue: DICOMWeb.getNumber(instance['00280106']),
    LargestPixelValue: DICOMWeb.getNumber(instance['00280107']),
    WindowCenter: DICOMWeb.getString(instance['00281050']),
    WindowWidth: DICOMWeb.getString(instance['00281051']),
    RescaleIntercept: DICOMWeb.getNumber(instance['00281052']),
    RescaleSlope: DICOMWeb.getNumber(instance['00281053']),
    RescaleSlope: DICOMWeb.getNumber(instance['00281054']),
    SourceImageInstanceUid: getSourceImageInstanceUid(instance),
    Laterality: DICOMWeb.getString(instance['00200062']),
    ViewPosition: DICOMWeb.getString(instance['00185101']),
    AcquisitionDateTime: DICOMWeb.getString(instance['0008002A']),
    NumberOfFrames: DICOMWeb.getNumber(instance['00280008']),
    FrameIncrementPointer: getFrameIncrementPointer(instance['00280009']),
    FrameTime: DICOMWeb.getNumber(instance['00181063']),
    FrameTimeVector: parseFloatArray(DICOMWeb.getString(instance['00181065'])),
    SliceThickness: DICOMWeb.getNumber(instance['00180050']),
    SpacingBetweenSlices: DICOMWeb.getString(instance['00180088']),
    LossyImageCompression: DICOMWeb.getString(instance['00282110']),
    DerivationDescription: DICOMWeb.getString(instance['00282111']),
    LossyImageCompressionRatio: DICOMWeb.getString(instance['00282112']),
    LossyImageCompressionMethod: DICOMWeb.getString(instance['00282114']),
    EchoNumber: DICOMWeb.getString(instance['00180086']),
    ContrastBolusAgent: DICOMWeb.getString(instance['00180010']),
    RadiopharmaceuticalInfo: getRadiopharmaceuticalInfo(instance), // TODO
    baseWadoRsUri: baseWadoRsUri,
    wadouri: WADOProxy.convertURL(wadouri, server),
    wadorsuri: WADOProxy.convertURL(wadorsuri, server),
    wadoRoot: server.wadoRoot,
    imageRendering: server.imageRendering,
    thumbnailRendering: server.thumbnailRendering,
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
