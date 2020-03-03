import * as dcmjs from 'dcmjs';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import FileLoader from './fileLoader';
import OHIF from '@ohif/core';

const metadataProvider = OHIF.cornerstone.metadataProvider;

const DICOMFileLoader = new (class extends FileLoader {
  fileType = 'application/dicom';
  loadFile(file, imageId) {
    return cornerstoneWADOImageLoader.wadouri.loadFileRequest(imageId);
  }

  getDataset(image, imageId) {
    let dataset = {};
    try {
      const dicomData = dcmjs.data.DicomMessage.readFile(image);

      dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
        dicomData.dict
      );

      metadataProvider.addInstance(dataset);

      dataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(
        dicomData.meta
      );
    } catch (e) {
      console.error('Error reading dicom file', e);
    }
    // Set imageId on dataset to be consumed later on
    dataset.imageId = imageId;

    return dataset;
  }

  getStudies(dataset, imageId) {
    return this.getStudyFromDataset(dataset);
  }

  getStudyFromDataset(dataset = {}) {
    const {
      StudyInstanceUID,
      StudyDate,
      StudyTime,
      AccessionNumber,
      ReferringPhysicianName,
      PatientName,
      PatientID,
      PatientBirthDate,
      PatientSex,
      StudyID,
      StudyDescription,
      /*
      NumberOfStudyRelatedSeries,
      NumberOfStudyRelatedInstances,
      Modality,
      ModalitiesInStudy,
      */
      SeriesInstanceUID,
      SeriesDescription,
      SeriesNumber,
      SOPInstanceUID,
      SOPClassUID,
      Rows,
      Columns,
      NumberOfFrames,
      InstanceNumber,
      imageId,
      Modality,
      /*ImageType,
        InstanceNumber,
        ImagePositionPatient,
        ImageOrientationPatient,
        FrameOfReferenceUID,
        SliceLocation,
        SamplesPerPixel,
        PhotometricInterpretation,
        PlanarConfiguration,
        PixelSpacing,
        PixelAspectRatio,
        BitsAllocated,
        BitsStored,
        HighBit,
        PixelRepresentation,
        SmallestPixelValue,
        LargestPixelValue,
        WindowCenter,
        WindowWidth,
        RescaleIntercept,
        RescaleSlope,
        RescaleType,
        Laterality,
        ViewPosition,
        AcquisitionDateTime,
        FrameIncrementPointer,
        FrameTime,
        FrameTimeVector,
        SliceThickness,
        SpacingBetweenSlices,
        LossyImageCompression,
        DerivationDescription,
        LossyImageCompressionRatio,
        LossyImageCompressionMethod,
        EchoNumber,
        ContrastBolusAgent,
        */
    } = dataset;

    const instance = {
      data: dataset,
      // SOPInstanceUID: SOPInstanceUID,
      // SOPClassUID: SOPClassUID,
      // Rows: Rows,
      // Columns: Columns,
      // NumberOfFrames: NumberOfFrames,
      // InstanceNumber: InstanceNumber,
      url: imageId,
      // Modality: Modality,
      /*
        TODO: in case necessary to uncoment this block, double check every property
        ImageType: ImageType || DICOMWeb.getString(dataset['00080008']),
        InstanceNumber: InstanceNumber || DICOMWeb.getNumber(dataset['00200013']),
        ImagePositionPatient: ImagePositionPatient || DICOMWeb.getString(dataset['00200032']),
        ImageOrientationPatient: ImageOrientationPatient || DICOMWeb.getString(dataset['00200037']),
        FrameOfReferenceUID: FrameOfReferenceUID || DICOMWeb.getString(dataset['00200052']),
        SliceLocation: SliceLocation || DICOMWeb.getNumber(dataset['00201041']),
        SamplesPerPixel: SamplesPerPixel || DICOMWeb.getNumber(dataset['00280002']),
        PhotometricInterpretation: PhotometricInterpretation || DICOMWeb.getString(dataset['00280004']),
        PlanarConfiguration: PlanarConfiguration || DICOMWeb.getNumber(dataset['00280006']),
        PixelSpacing: PixelSpacing || DICOMWeb.getString(dataset['00280030']),
        PixelAspectRatio: PixelAspectRatio || DICOMWeb.getString(dataset['00280034']),
        BitsAllocated: BitsAllocated || DICOMWeb.getNumber(dataset['00280100']),
        BitsStored: BitsStored || DICOMWeb.getNumber(dataset['00280101']),
        HighBit: HighBit || DICOMWeb.getNumber(dataset['00280102']),
        PixelRepresentation: PixelRepresentation || DICOMWeb.getNumber(dataset['00280103']),
        SmallestPixelValue: SmallestPixelValue || DICOMWeb.getNumber(dataset['00280106']),
        LargestPixelValue: LargestPixelValue || DICOMWeb.getNumber(dataset['00280107']),
        WindowCenter: WindowCenter || DICOMWeb.getString(dataset['00281050']),
        WindowWidth: WindowWidth || DICOMWeb.getString(dataset['00281051']),
        RescaleIntercept: RescaleIntercept || DICOMWeb.getNumber(dataset['00281052']),
        RescaleSlope: RescaleSlope || DICOMWeb.getNumber(dataset['00281053']),
        RescaleSlope: RescaleType || DICOMWeb.getNumber(dataset['00281054']),
        SourceImageInstanceUid: getSourceImageInstanceUid(dataset),
        Laterality: Laterality || DICOMWeb.getString(dataset['00200062']),
        ViewPosition: ViewPosition || DICOMWeb.getString(dataset['00185101']),
        AcquisitionDateTime: AcquisitionDateTime || DICOMWeb.getString(dataset['0008002A']),
        FrameIncrementPointer: FrameIncrementPointer || getFrameIncrementPointer(dataset['00280009']),
        FrameTime: FrameTime || DICOMWeb.getNumber(dataset['00181063']),
        FrameTimeVector: FrameTimeVector || parseFloatArray(
          DICOMWeb.getString(dataset['00181065'])
        ),
        SliceThickness: SliceThickness || DICOMWeb.getNumber(dataset['00180050']),
        SpacingBetweenSlices: SpacingBetweenSlices || DICOMWeb.getString(dataset['00180088']),
        LossyImageCompression: LossyImageCompression || DICOMWeb.getString(dataset['00282110']),
        DerivationDescription: DerivationDescription || DICOMWeb.getString(dataset['00282111']),
        LossyImageCompressionRatio: LossyImageCompressionRatio || DICOMWeb.getString(dataset['00282112']),
        LossyImageCompressionMethod: LossyImageCompressionMethod || DICOMWeb.getString(dataset['00282114']),
        EchoNumber: EchoNumber || DICOMWeb.getString(dataset['00180086']),
        ContrastBolusAgent: ContrastBolusAgent || DICOMWeb.getString(dataset['00180010']),
        RadiopharmaceuticalInfo: getRadiopharmaceuticalInfo(dataset),
        wadouri: WADOProxy.convertURL(wadouri, server),
        wadorsuri: WADOProxy.convertURL(wadorsuri, server),*/
    };

    const series = {
      SeriesInstanceUID: SeriesInstanceUID,
      SeriesDescription: SeriesDescription,
      SeriesNumber: SeriesNumber,
      instances: [instance],
    };

    const study = {
      StudyInstanceUID: StudyInstanceUID,
      StudyDate: StudyDate,
      StudyTime: StudyTime,
      AccessionNumber: AccessionNumber,
      ReferringPhysicianName: ReferringPhysicianName,
      PatientName: PatientName,
      PatientId: PatientID,
      PatientBirthdate,
      PatientSex: PatientSex,
      StudyId: StudyID,
      StudyDescription: StudyDescription,
      /*
      TODO: in case necessary to uncomment this block, double check every property
      numberOfStudyRelatedSeries: NumberOfStudyRelatedSeries || DICOMWeb.getString(dataset['00201206']),
      numberOfStudyRelatedInstances: NumberOfStudyRelatedInstances || DICOMWeb.getString(dataset['00201208']),
      Modality: Modality || DICOMWeb.getString(dataset['00080060']),
      modalitiesInStudy: ModalitiesInStudy || DICOMWeb.getString(dataset['00080061']),
      modalities:
      */
      seriesList: [series],
    };

    console.log(imageId);

    return study;
  }
})();

export default DICOMFileLoader;
