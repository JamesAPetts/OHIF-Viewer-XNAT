import ViewportGridService from './ViewportGridService';

export default {
  name: 'ViewportGridService',
  create: ({ configuration = {} }) => {
    return new ViewportGridService();
  },
};
