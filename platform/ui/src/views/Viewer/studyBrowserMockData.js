const studyWithSR = {
  studyInstanceUid: '1',
  date: '07-Sept-2010',
  description: 'CHEST/ABD/PELVIS W/CONTRAST',
  numInstances: 902,
  modalities: 'CT,SR',
  displaySets: [
    {
      displaySetInstanceUid: 'f69f6asdasd48c-223e-db7f-c4af-b8906641a66e',
      description: 'Multiple line image series description lorem sit',
      seriesNumber: 1,
      numInstances: 68,
      componentType: 'thumbnailTracked',
      viewportIdentificator: 'A',
      isTracked: true,
    },
    {
      displaySetInstanceUid: 'f69f648c-223e-db7f-c4asdasdaf-b8906641a66e',
      description: 'Multiple line image series description lorem sit',
      seriesNumber: 1,
      numInstances: 68,
      componentType: 'thumbnailTracked',
      viewportIdentificator: 'B',
    },
    {
      displaySetInstanceUid: 'f69f648c-223e-dasdasdb7f-c4af-b8906641a66e',
      description: 'Multiple line image series description lorem sit',
      seriesNumber: 1,
      numInstances: 68,
      componentType: 'thumbnailTracked',
    },
    {
      displaySetInstanceUid: 'f69f648c-223e-db7f-c4afas-b8906asd641a66e',
      description: 'Multiple line description lorem ipsum dolor sit amet',
      modality: 'SR',
      componentType: 'thumbnailNoImage',
      seriesDate: '07-Sept-2010',
    },
  ],
};

const studySimple = {
  studyInstanceUid: '2',
  date: '07-Sept-2010',
  description: 'CHEST/ABD/PELVIS W/CONTRAST',
  numInstances: 902,
  modalities: 'CT',
  displaySets: [
    {
      displaySetInstanceUid: 'f69f648c-223e-db7f-c4af-b8906641a66e',
      description: 'Multiple line image series description lorem sit',
      seriesNumber: 1,
      numInstances: 68,
      componentType: 'thumbnailTracked',
    },
  ],
};

const tabs = [
  {
    name: 'primary',
    label: 'Primary',
    studies: [studySimple],
  },
  {
    name: 'recent',
    label: 'Recent',
    studies: [studyWithSR, studySimple],
  },
  {
    name: 'all',
    label: 'All',
    studies: [studySimple, studyWithSR],
  },
];

export { tabs };