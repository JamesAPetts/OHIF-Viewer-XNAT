import { InstanceMetadata, SeriesMetadata, StudyMetadata } from './metadata';

import CommandsManager from './CommandsManager.js';
import { DICOMFileLoadingListener } from './StudyLoadingListener';
import HotkeysManager from './HotkeysManager.js';
import ImageSet from './ImageSet';
import UIDSpecificMetadataProvider from './UIDSpecificMetadataProvider';
import OHIFError from './OHIFError.js';
import { OHIFStudyMetadataSource } from './OHIFStudyMetadataSource';
import { StackLoadingListener } from './StudyLoadingListener';
import { StudyLoadingListener } from './StudyLoadingListener';
import { StudyMetadataSource } from './StudyMetadataSource';
import { StudyPrefetcher } from './StudyPrefetcher';
import { TypeSafeCollection } from './TypeSafeCollection';

export {
  OHIFStudyMetadataSource,
  UIDSpecificMetadataProvider,
  CommandsManager,
  HotkeysManager,
  ImageSet,
  StudyPrefetcher,
  StudyLoadingListener,
  StackLoadingListener,
  DICOMFileLoadingListener,
  StudyMetadata,
  SeriesMetadata,
  InstanceMetadata,
  TypeSafeCollection,
  OHIFError,
  StudyMetadataSource,
};

const classes = {
  OHIFStudyMetadataSource,
  UIDSpecificMetadataProvider,
  CommandsManager,
  HotkeysManager,
  ImageSet,
  StudyPrefetcher,
  StudyLoadingListener,
  StackLoadingListener,
  DICOMFileLoadingListener,
  StudyMetadata,
  SeriesMetadata,
  InstanceMetadata,
  TypeSafeCollection,
  OHIFError,
  StudyMetadataSource,
};

export default classes;
