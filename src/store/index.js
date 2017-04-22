import Vue from 'vue';
import Vuex from 'vuex';
import auth from './modules/auth';
import calendar from './modules/calendar';

Vue.use(Vuex);

const store = new Vuex.Store({
  modules: {
    auth,
    calendar,
  },
});

export default store;
