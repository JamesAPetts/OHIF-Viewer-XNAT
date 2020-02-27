import { WadoRsMetaDataBuilder } from '../classes/metadata/WadoRsMetaDataBuilder';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import getWADORSImageId from './getWADORSImageId';

function getRadiopharmaceuticalInfoMetaData(instance) {
  const RadiopharmaceuticalInfo = instance.RadiopharmaceuticalInfo;

  if (instance.Modality !== 'PT' || !RadiopharmaceuticalInfo) {
    return;
  }

  return new WadoRsMetaDataBuilder()
    .addTag('00181072', RadiopharmaceuticalInfo.RadiopharmaceuticalStartTime)
    .addTag('00181074', RadiopharmaceuticalInfo.RadionuclideTotalDose)
    .addTag('00181075', RadiopharmaceuticalInfo.RadionuclideHalfLife)
    .toJSON();
}

const getWadoRsInstanceMetaData = (study, series, instance) => {
  return new WadoRsMetaDataBuilder()
    .addTag('00080016', instance.SOPClassUID)
    .addTag('00080018', instance.SOPInstanceUID)
    .addTag('00080021', series.SeriesDate)
    .addTag('00080031', series.SeriesTime)
    .addTag('0008103e', series.SeriesDescription)
    .addTag('00080060', series.Modality)
    .addTag('00101010', study.PatientAge)
    .addTag('00101020', study.PatientSize)
    .addTag('00101030', study.PatientWeight)
    .addTag('0020000d', study.StudyInstanceUID)
    .addTag('00081030', study.StudyDescription)
    .addTag('00100010', study.PatientName)
    .addTag('00100020', study.PatientId)
    .addTag('00080020', study.StudyDate)
    .addTag('00080030', study.StudyTime)
    .addTag('00080050', study.AccessionNumber)
    .addTag('00200013', instance.InstanceNumber)
    .addTag('00180050', instance.SliceThickness)
    .addTag('0020000e', series.SeriesInstanceUID)
    .addTag('00200011', series.SeriesNumber)
    .addTag('00200032', instance.ImagePositionPatient, true)
    .addTag('00200037', instance.ImageOrientationPatient, true)
    .addTag('00200052', instance.FrameOfReferenceUID)
    .addTag('00201041', instance.SliceLocation)
    .addTag('00280002', instance.SamplesPerPixel)
    .addTag('00280004', instance.PhotometricInterpretation)
    .addTag('00280006', instance.PlanarConfiguration)
    .addTag('00280010', instance.Rows)
    .addTag('00280011', instance.Columns)
    .addTag('00280030', instance.PixelSpacing, true)
    .addTag('00280034', instance.PixelAspectRatio, true)
    .addTag('00280100', instance.BitsAllocated)
    .addTag('00280101', instance.BitsStored)
    .addTag('00280102', instance.HighBit)
    .addTag('00280103', instance.PixelRepresentation)
    .addTag('00280106', instance.SmallestPixelValue)
    .addTag('00280107', instance.LargestPixelValue)
    .addTag('00281050', instance.WindowCenter, true)
    .addTag('00281051', instance.WindowWidth, true)
    .addTag('00281052', instance.RescaleIntercept)
    .addTag('00281053', instance.RescaleSlope)
    .addTag('00281054', instance.RescaleSlope)
    .addTag('00281101', instance.RedPaletteColorLookupTableDescriptor)
    .addTag('00281102', instance.GreenPaletteColorLookupTableDescriptor)
    .addTag('00281103', instance.BluePaletteColorLookupTableDescriptor)
    .addTag('00281201', instance.RedPaletteColorLookupTableData)
    .addTag('00281202', instance.GreenPaletteColorLookupTableData)
    .addTag('00281203', instance.BluePaletteColorLookupTableData)
    .addTag('00540016', getRadiopharmaceuticalInfoMetaData(instance))
    .toJSON();
};

/**
 * Update metadata manager with instances of a specifc series
 * @param {Object} study A plain study descriptor object
 * @param {Object} series A Series descriptor object contaning the instances to be added to the manager
 */
function updateMetaDataManagerForSeries(study, series) {
  series.instances.forEach(instance => {
    const metaData = getWadoRsInstanceMetaData(study, series, instance);
    const NumberOfFrames = instance.NumberOfFrames || 1;

    // We can share the same metaData with all frames because it doesn't have
    // any frame specific data, such as frameNumber, pixelData, offset, etc.
    // WADO-RS frame number is 1-based
    for (let frameNumber = 0; frameNumber < NumberOfFrames; frameNumber++) {
      const imageId = getWADORSImageId(instance, frameNumber);

      // TODO Make a metadata manager which uses study/series/instance UIDS instead of imageIds
      cornerstoneWADOImageLoader.wadors.metaDataManager.add(imageId, metaData);
    }
  });
}

/**
 * Update metadata manager
 * @param {Object} study A plain study descriptor object
 * @param {string} [SeriesInstanceUID] The Series Instance UID of the series to be added (Optional)
 */
export default function updateMetaDataManager(study, SeriesInstanceUID) {
  if (SeriesInstanceUID) {
    const series = study.seriesMap[SeriesInstanceUID];
    updateMetaDataManagerForSeries(study, series);
  } else {
    study.seriesList.forEach(series => {
      updateMetaDataManagerForSeries(study, series);
    });
  }
}
