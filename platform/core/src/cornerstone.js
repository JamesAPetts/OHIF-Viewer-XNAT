import uidSpecificMetadataProvider from './classes/UIDSpecificMetadataProvider';
import {
  getBoundingBox,
  pixelToPage,
  repositionTextBox,
} from './lib/cornerstone.js';

const cornerstone = {
  uidSpecificMetadataProvider,
  getBoundingBox,
  pixelToPage,
  repositionTextBox,
};

export default cornerstone;
