import MetadataProvider from './classes/MetadataProvider';
import uidSpecificMetadataProvider from './classes/UIDSpecificMetadataProvider';
import {
  getBoundingBox,
  pixelToPage,
  repositionTextBox,
} from './lib/cornerstone.js';

const cornerstone = {
  MetadataProvider,
  uidSpecificMetadataProvider,
  getBoundingBox,
  pixelToPage,
  repositionTextBox,
};

export default cornerstone;
