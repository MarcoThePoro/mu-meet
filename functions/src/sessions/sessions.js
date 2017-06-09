import shortid from 'shortid';
import a from 'awaiting';
import admin from 'firebase-admin';
import R from 'ramda';
import getStartOfWeek from 'date-fns/start_of_week';
import getEndOfWeek from 'date-fns/end_of_week';
import parseDate from 'date-fns/parse';
import { getOAuth2Client } from '../auth/google-oauth';
import { fetchEvents } from '../calendar/google-calendar';
import addMinutes from 'date-fns/add_minutes';
import { Timeslot, getAvailableTimeslots } from './timeslot';
import getDifferenceInMinutes from 'date-fns/difference_in_minutes';
import addHours from 'date-fns/add_hours';

const SESSION_ERROR_CODES = {
  ALREADY_IN_SESSION: 'session/already-in-session',
};

export class SessionError extends Error {
  static get codes() {
    return SESSION_ERROR_CODES;
  }
  constructor(code, message) {
    super(message);
    this.message = message;
    this.code = code;
  }
}

const DEFAULT_STATE = {
  host: null,
  users: {},
  startedAt: null,
  config: {
    minDuration: 1,
    searchFromDate: null,
    searchToDate: null,
    searchFromHour: 9,
    searchToHour: 18,
    days: [false, true, true, true, true, true, false],
  },
  result: {
    pending: false,
    meetings: [],
  },
};

/**
 * Creates a new session and sets the host to the supplied user
 * @param  {string} hostId
 */
export async function createSession(hostId, { startedAt, timezoneOffset }) {
  const database = admin.database();

  const host = await database
    .ref(`/users/${hostId}`)
    .once('value')
    .then(snapshot => snapshot.val());

  if (host.currentSession) {
    throw new SessionError(
      SessionError.codes.ALREADY_IN_SESSION,
      `User ${hostId} tried to create a new session, but is already in one.`,
    );
  }

  const sessionId = shortid.generate();

  const session = Object.assign({}, DEFAULT_STATE, {
    host: hostId,
    startedAt: parseDate(startedAt),
    config: Object.assign({}, DEFAULT_STATE.config, {
      searchFromDate: addMinutes(
        getStartOfWeek(parseDate(startedAt)),
        timezoneOffset,
      ),
      searchToDate: addMinutes(
        getEndOfWeek(parseDate(startedAt)),
        timezoneOffset,
      ),
      timezoneOffset,
    }),
    users: {
      [hostId]: { subscribed: false },
    },
  });

  await a.list([
    database.ref(`/sessions/${sessionId}`).set(serializeSession(session)),
    database.ref(`/users/${hostId}/current-session`).set(sessionId),
  ]);
}

export async function findMeetingTimes(sessionId) {
  const database = admin.database();

  const sessionRef = database.ref(`/sessions/${sessionId}`);

  const uids = await sessionRef
    .child(`users`)
    .once('value')
    .then(s => s.val())
    .then(R.keys);

  const config = await sessionRef
    .child('config')
    .once('value')
    .then(s => s.val())
    .then(hydrateConfig);

  await sessionRef.child('result/pending').set(true);
  await sessionRef.child('phase').set('PHASE_RESULT');

  // FIXME don't do this serially
  const calendarEvents = [];
  for (let uid of uids) {
    let { save, oAuth2Client } = await getOAuth2Client(uid);
    const calendarIds = await database
      .ref(`/users/${uid}/selected-calendars`)
      .once('value')
      .then(s => s.val())
      .then(R.compose(R.map(atob), R.keys, R.pickBy(R.identity)));

    for (let calendarId of calendarIds) {
      calendarEvents.push(
        ...(await fetchEvents(uid, oAuth2Client, {
          from: config.searchFromDate,
          to: config.searchToDate,
          calendarId,
        })),
      );
    }

    save();
  }

  console.log(
    `Fetched ${calendarEvents.length} events from ${config.searchFromDate.toString()} to ${config.searchToDate.toString()}`,
  );

  const calendarEventTimeslots = calendarEvents.map(
    event =>
      new Timeslot(
        parseDate(event.start.dateTime),
        getDifferenceInMinutes(
          parseDate(event.end.dateTime),
          parseDate(event.start.dateTime),
        ),
      ),
  );

  console.log(calendarEventTimeslots.map(x => x.toJSON()));

  const restrictedHours = [];
  let current = config.searchFromDate;
  for (let i = 0; i < 7; i++) {
    restrictedHours.push(new Timeslot(current, config.searchFromHour * 60));
    restrictedHours.push(
      new Timeslot(
        addHours(current, config.searchToHour),
        (24 - config.searchToHour) * 60,
      ),
    );
    current = addHours(current, 24);
  }

  const restrictedDays = [];
  for (let i = 0; i < 7; i++) {
    if (!config.days[i]) {
      restrictedDays.push(
        new Timeslot(addMinutes(config.searchFromDate, 60 * 24 * i), 60 * 24),
      );
    }
  }

  const range = new Timeslot(config.searchFromDate, 60 * 24 * 7);
  const meetings = Timeslot.accumulate(
    getAvailableTimeslots(
      range,
      R.flatten([calendarEventTimeslots, restrictedHours, restrictedDays]),
      30,
    ),
  );

  // TODO prioritise

  await sessionRef
    .child('result/meetings')
    .set(meetings.map(timeslot => timeslot.toJSON()));
  await sessionRef.child('result/pending').set(false);
}

// function hydrateSession(session) {
//   return R.evolve({
//     startedAt: parseDate,
//     config: hydrateConfig,
//   })(session);
// }

function serializeSession(session) {
  return R.evolve({
    startedAt: toString,
    config: serializeConfig,
  })(session);
}

function hydrateConfig(config) {
  return R.evolve({
    searchFromDate: parseDate,
    searchToDate: parseDate,
  })(config);
}

function serializeConfig(config) {
  return R.evolve({
    searchFromDate: toString,
    searchToDate: toString,
  })(config);
}

function toString(date) {
  return date.toString();
}

function atob(encoded) {
  return Buffer.from(encoded, 'base64').toString();
}

// function btoa(raw) {
//   return new Buffer(raw).toString('base64');
// }
