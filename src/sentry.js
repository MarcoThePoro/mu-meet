import Vue from 'vue';
import Raven from 'raven-js';
import RavenVue from 'raven-js/plugins/vue';

if (process.env.SENTRY_DSN) {
  const build = process.env.BUILD_ID;
  const dsn = process.env.SENTRY_DSN;
  if (!build) throw new Error('Must supply BUILD_ID env variable');
  if (!dsn) throw new Error('Must supply SENTRY_DSN env variable');

  console.info('Release Version:', build);
  console.info('Activating Sentry error reporting.');

  Raven.config(dsn, {
    release: build,
  })
    .addPlugin(RavenVue, Vue)
    .install();
}
