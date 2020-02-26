import cornerstone from 'cornerstone-core';

export default function(element) {
  // Get the Cornerstone imageId
  const enabledElement = cornerstone.getEnabledElement(element);
  const imageId = enabledElement.image.imageId;

  // Get StudyInstanceUID & PatientId
  const study = cornerstone.metaData.get('study', imageId);
  const StudyInstanceUID = study.StudyInstanceUID;
  const PatientId = study.PatientId;

  // Get SeriesInstanceUID
  const series = cornerstone.metaData.get('series', imageId);
  const SeriesInstanceUID = series.SeriesInstanceUID;

  // Get SOPInstanceUID
  const sopInstance = cornerstone.metaData.get('instance', imageId);
  const SOPInstanceUID = sopInstance.SOPInstanceUID;
  const frameIndex = sopInstance.frame || 0;

  const imagePath = [
    StudyInstanceUID,
    SeriesInstanceUID,
    SOPInstanceUID,
    frameIndex,
  ].join('_');

  return {
    PatientId,
    StudyInstanceUID,
    SeriesInstanceUID,
    SOPInstanceUID,
    frameIndex,
    imagePath,
  };
}
