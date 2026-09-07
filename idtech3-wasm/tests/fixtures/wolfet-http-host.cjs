'use strict';

// A disposable HTTP-contract host, never a dedicated game process. The parent
// supplies a private fixture data root and the actual shared framework package.
const host = require('../../games/wolfet/server/index');
host.setLifecycleForTests({ status: () => ({ state: 'sleeping', humans: 0, map: null }),
  wake: async () => { throw new Error('Native startup is forbidden in this HTTP fixture.'); } });
host.startHttp(0).then(server => {
  process.send({ port: server.address().port });
  process.once('message', () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}).catch(() => process.exit(1));
