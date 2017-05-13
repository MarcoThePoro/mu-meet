import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp(functions.config().firebase);

export { createSession } from './sessions';
export {
  getGoogleOAuth2Authorization,
  linkGoogleOAuthToFirebaseUser,
} from './auth';
export { getCalendars } from './calendar';
export { onUserCreateStoreInfo } from './users';
