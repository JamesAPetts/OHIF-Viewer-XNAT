import React, { createContext, useContext, useReducer } from 'react';

const VIEWPORT_GRID_DEFAULT_STATE = {
  numCols: 1,
  numRows: 1,
  activeViewportIndex: 0,
  viewports: [],
  elements: [],
};

// A UI Service may need to use the ViewportGrid context
const viewportGridReducer = (state, action) => {
  console.log(state, action);

  switch (action.type) {
    case 'SET_ACTIVE_VIEWPORT_INDEX':
      return { ...state, ...{ activeViewportIndex: action.payload } };
    case 'SET_DISPLAYSET_FOR_VIEWPORT': {
      const { viewportIndex, displaySetInstanceUID } = action.payload;
      const viewports = state.viewports.slice();

      viewports[viewportIndex] = { displaySetInstanceUID };

      return { ...state, ...{ viewports } };
    }
    case 'SET_LAYOUT': {
      const { numCols, numRows } = action.payload;
      const numPanes = numCols * numRows;
      const viewports = state.viewports.slice();
      const activeViewportIndex =
        state.activeViewportIndex >= numPanes ? 0 : state.activeViewportIndex;

      while (viewports.length < numPanes) {
        viewports.push({});
      }
      while (viewports.length > numPanes) {
        viewports.pop();
      }

      return {
        ...state,
        ...{ activeViewportIndex, numCols, numRows, viewports },
      };
    }
    case 'SET_ENABLED_ELEMENT': {
      const { viewportIndex, element } = action.payload;
      const elements = state.elements.slice();

      elements[viewportIndex] = element;

      return { ...state, ...{ elements } };
    }
    default:
      return action.payload;
  }
};

export const ViewportGridContext = createContext();

export function ViewportGridProvider({ initialState, children }) {
  if (!initialState) {
    initialState = { ...VIEWPORT_GRID_DEFAULT_STATE };
  }
  return (
    <ViewportGridContext.Provider
      value={useReducer(viewportGridReducer, initialState)}
    >
      {children}
    </ViewportGridContext.Provider>
  );
}

export const useViewportGrid = () => useContext(ViewportGridContext);
