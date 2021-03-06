var BaseCommand = require('./base');

module.exports = BaseCommand.extend({
    name: 'update',
    description: 'update a Ghost instance',

    arguments: [
        {name: 'version', optional: true}
    ],
    options: [{
        name: 'rollback',
        alias: 'R',
        description: 'Rollback to the previously installed Ghost version',
        flag: true
    }],

    execute: function (version, options) {
        this.checkValidInstall();

        var Promise         = require('bluebird'),
            path            = require('path'),
            fs              = require('fs-extra'),
            Config          = require('../utils/config'),
            resolveVersion  = require('../utils/resolve-version'),
            config          = Config.load('.ghost-cli'),
            self            = this,
            installPath, environment;

        if (options.rollback) {
            if (!config.get('previous-version')) {
                return Promise.reject('No previous version found');
            }

            version = config.get('previous-version');
            installPath = path.join(process.cwd(), 'versions', version);
        }

        environment = config.get('running', null);

        return this.runCommand('doctor', 'update').then(function fetchVersion() {
            if (options.rollback) {
                return Promise.resolve();
            }

            return resolveVersion(version, config.get('active-version'))
                .then(function installGhost(resolvedVersion) {
                    version = resolvedVersion;
                    installPath = path.join(process.cwd(), 'versions', version);

                    if (fs.existsSync(installPath)) {
                        // Version is already installed, skip the install
                        // TODO: when the --force flag is implemented, delete the
                        // existing dir if the option is supplied
                        return Promise.resolve();
                    }

                    return self.runTask('npm-download', {
                        module: 'ghost',
                        version: version,
                        destination: installPath
                    }, 'Downloading the updated version of Ghost');
                });
        }).then(function stopCurrentGhost() {
            if (!environment) {
                // If environment isn't set ghost is not running.
                // Therefore we don't need to stop Ghost, so skip that part
                return Promise.resolve();
            }

            return self.runCommand('stop');
        }).then(function afterStop() {
            var symlinkSync = require('symlink-or-copy').sync;

            fs.removeSync(path.join(process.cwd(), 'current'));

            symlinkSync(installPath, path.join(process.cwd(), 'current'));
        }).then(function restartGhost() {
            config.set(
                'previous-version',
                (options.rollback) ? null : config.get('active-version')
            ).set('active-version', version).save();

            var startConfig = [];
            startConfig[environment] = true;

            return self.runCommand('start', startConfig);
        });
    }
});
