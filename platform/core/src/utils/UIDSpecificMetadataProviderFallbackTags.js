function getFallbackTagFromInstance(tag, instance) {
  if (instance[tag]) {
    return instance[tag];
  }

  const fallbackTags = fallbackTagsMap[tag];

  if (fallbackTags) {
    for (let i = 0; i < fallbackTags.length; i++) {
      const fallbackTag = fallbackTags[i];

      if (instance[fallbackTag]) {
        return instance[fallbackTag];
      }
    }
  }
}

const fallbackTagsMap = {
  PixelSpacing: ['ImagerPixelSpacing'],
};

export { fallbackTagsMap, getFallbackTagFromInstance };
