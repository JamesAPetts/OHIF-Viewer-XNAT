import pubSubServiceInterface from '../_shared/pubSubServiceInterface';
import EVENTS from './EVENTS';

export default class ViewportGridService {
  constructor() {
    this.viewports = [];
    this.activeViewportIndex = 0;
    this.EVENTS = EVENTS;

    Object.assign(this, pubSubServiceInterface);
  }

  /**
   * Broadcasts toolbarService changes.
   *
   * @param {string} eventName The event name
   * @return void
   */
  _broadcastChange = (eventName, callbackProps) => {
    const hasListeners = Object.keys(this.listeners).length > 0;
    const hasCallbacks = Array.isArray(this.listeners[eventName]);

    if (hasListeners && hasCallbacks) {
      this.listeners[eventName].forEach(listener => {
        listener.callback(callbackProps);
      });
    }
  };

  get() {
    const { viewports, activeViewportIndex } = this;

    return { viewports, activeViewportIndex };
  }

  setViewport(viewportIndex, viewport) {
    this.viewports[viewportIndex] = viewport;

    this._broadcastChange(this.EVENTS.VIEWPORT_CHANGED, {
      viewports,
      viewportIndex,
    });
  }

  setActiveViewportIndex(viewportIndex) {
    this.activeViewportIndex = viewportIndex;

    this._broadcastChange(this.EVENTS.ACTIVE_VIEWPORT_INDEX_CHANGED, {
      viewports,
      viewportIndex,
    });
  }

  getActiveViewport() {
    const { viewports, activeViewportIndex } = this;
    return viewports[activeViewportIndex];
  }
}
