module.exports = (npm) => {
  const logNotice = (label) => {
    try {
      npm?.log?.notice?.('targetbot', label);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(label);
    }
  };

  const runInstall = (cb) => {
    const args = ['--force', '--legacy-peer-deps'];
    logNotice('Intercepted npm clean install; running npm install --force --legacy-peer-deps instead.');
    return npm.commands.install(args, cb);
  };

  const wrap = (commandName) => {
    const original = npm.commands[commandName];
    if (typeof original !== 'function') {
      return;
    }

    npm.commands[commandName] = function wrappedCommand(args, cb) {
      if (typeof args === 'function') {
        cb = args;
        args = [];
      }

      return runInstall(cb);
    };
  };

  wrap('ci');
  wrap('clean-install');
  wrap('install-clean');
  wrap('isntall-clean');
};
