import * as firebase from 'firebase';
import shortid from 'shortid';
import R from 'ramda';
import getStartOfWeek from 'date-fns/start_of_week';
import getEndOfWeek from 'date-fns/end_of_week';
import parseDate from 'date-fns/parse';
import { getFreeHalfHourIntervals } from '../../scheduler';
import getGoogle from '@/gapi';

export default {
  state: {
    isInSession: false,
    id: null,
    events: [],
  },
  mutations: {
    updateSessionStatus(state, data) {
      if (data) {
        state.isInSession = true;
        Object.assign(state, data);
      } else {
        state.isInSession = false;
      }
    },
    updateAllEvents(state, data) {
      state.events = data;
    },
  },
  actions: {
    async createSession({ commit }) {
      const database = firebase.database();

      const sessionsRef = database.ref('/sessions');
      const id = shortid.generate();
      const sessionRef = sessionsRef.child(id);

      sessionRef.child('host').set(firebase.auth().currentUser.uid);
      sessionRef
        .child(`/users/${firebase.auth().currentUser.uid}`)
        .set({ pending: true });

      const userRef = database.ref(`/users/${firebase.auth().currentUser.uid}`);
      userRef.child('session').set(id);
      commit('updateSessionStatus', {
        id: sessionRef.key,
      });
    },
    async joinSession({ commit, rootState }, id) {
      const database = firebase.database();

      const sessionRef = database.ref(`/sessions/${id}`);
      const session = await sessionRef.once('value');
      if (!session) {
        throw new Error('no session with id: ' + id);
      }

      sessionRef
        .child(`users/${rootState.auth.user.uid}`)
        .set({ pending: true });
      const userRef = database.ref(`/users/${firebase.auth().currentUser.uid}`);
      userRef.child('session').set(id);
      commit('updateSessionStatus', {
        id: sessionRef.key,
      });
    },
    async loadCalendarEvents({ commit, state, rootState }, calendarIds) {
      const google = await getGoogle();
      const database = firebase.database();

      console.log(calendarIds);

      const responses = await Promise.all(
        calendarIds.map(id =>
          google.client.calendar.events.list({
            calendarId: id,
            timeMin: getStartOfWeek(new Date()).toISOString(),
            timeMax: getEndOfWeek(new Date()).toISOString(),
            orderBy: 'startTime',
            showDeleted: false,
            singleEvents: true,
          }),
        ),
      );
      const calendars = responses.map(response => JSON.parse(response.body));
      const events = R.flatten(calendars.map(calendar => calendar.items));

      console.log(events);

      database
        .ref(`/sessions/${state.id}/users/${rootState.auth.user.uid}/events`)
        .set(events);
    },
    async getAllEvents({ commit, state }) {
      const database = firebase.database();
      const users = (await database
        .ref(`/sessions/${state.id}/users`)
        .once('value')).val();

      console.log(users);

      const events = R.compose(
        R.map(event => ({
          start: parseDate(event.start.dateTime),
          end: parseDate(event.end.dateTime),
        })),
        R.filter(R.identity),
        R.flatten,
        R.map(user => user.events),
        R.map(R.defaultTo({ events: [] })),
        R.values,
      )(users);

      commit('updateAllEvents', events);

      console.log(getFreeHalfHourIntervals(events));
    },
  },
};
