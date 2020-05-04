// Register a new Toolbar button type
// Have Generic toolbar configuration definitions
// Register multiple loadouts, or the ability to set a loadout

const appConfig = () => {
  return {
    // Look at Gatsby.js node files
    // https://www.gatsbyjs.org/docs/browser-apis/
    wrapRootElement: function() {},
    wrapPageElement: function() {},
  }
}


const mode = ({ loadOutManager }) => {
  /**
   * Unique identifier for mode. Used in route generation as initial route
   * segment.
   */
  id: 'my-mode',
  /**
   * Aggregate tags that should be queried for to make a validation decision.
   * Separated by study/series, and using NaturalizedDICOM naming convention.
   */
  validationTags: { study: ["ModalitiesInStudy"], series: ["Modality"] },
  /**
   * @param {object} studyTags - Object containing values for each tag listed in `validationTags.study`
   * @param {string[]} studyTags.* - Array of string value representations per DICOM Tag
   * @param {object[]} seriesTags - Array of objects containing values for each tag listed in `validationTags.series`
   * @param {string[]} seriesTags.* - Array of string value representations per DICOM Tag
   */
  isValidMode: (studyTags, seriesTags) => {
    //Example MR needed in study:
    return studyTags.ModalitiesInStudy.includes('MR');
  },

  routes: [{
    path: 'viewer/:someTemplateParameterProp',
  /**
   * ~~ LIFECYCLE
   */
  preInit: () => {
    toolbarManager.addButtons({
      name: 'xxx',
      type: TOOLBAR_TYPE.TOGGLE,
      options: {}
    });

    toolbarManager.setDefaultLoadOut([
      // Primary
      ["WWWC", "Zoom", {label: 'more', buttons: ["my-nested-button"]} ],
      // Secondary
      ["ArrowAnnotate"],
    ]);
    toolbarManager.addLoadOut("CardiacTools", [
      // Primary
      ["WWWC"],
      // Secondary
      ["ArrowAnnotate"]
    ]);
  },
    // Need a way to specify query params?

    layoutTemplate: ({ routeProps, }) => {
      return {
        id: 'org.ohif.defaults.viewerlayout',
        props: { // named slots
          leftPanels: ['org.ohif.defaults.seriesList'],
          rightPanels: ['org.ohif.defaults.seg', 'org.ohif.defaults.measure'],
          viewports: ['org.ohif.defaults.cornerstoneViewport', 'org.ohif.defaults.vtkViewport'],
        }
      }
    },
    hotkeys: [],
    /**
     *
     */
    onStepChange: (previousStep, currentStep) => {
      if (currentstep === 4) {
        toolbarManager.setLoadOut("CardiacTools");
      };
      // Seg Panel
      extensionsManager.disable('org.ohif.defaults.seg')
      extensionsManager.enable('org.ohif.defaults.measure')
      // Measurement Panel
      extensionsManager.enable('org.ohif.defaults.seg')
      extensionsManager.disable('org.ohif.defaults.measure')
    },
  }],
  services: '?',
  extensions: ['org.ohif.defaults', 'org.ohif.cornerstone', 'org.ohif.vtk'],

}
