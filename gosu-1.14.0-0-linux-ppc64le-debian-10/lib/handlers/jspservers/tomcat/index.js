'use strict';

const _ = require('lodash');
const JspServerHandler = require('../handler');
const logFunctions = require('../../../log');

/**
 * Tomcat handler functions.
 * @namespace handler.jspservers.tomcat
 */
class TomcatHandler extends JspServerHandler {
  constructor(options) {
    super(options);
    _.assign(this, {
      user: 'tomcat',
      group: 'tomcat',
      httpPort: '8080',
      ajpPort: '8009',
      dataDir: '/bitnami/tomcat/webapps',
      installdir: '/opt/bitnami/tomcat',
      binDir: '/opt/bitnami/tomcat/bin',
      logsDir: '/opt/bitnami/tomcat/logs',
    });
  }

  // Service managament
  /**
   * Restart the Tomcat server
   * @function handler.jspservers.tomcat~restart
   * @example
   * restart();
   */
  restart() {
    return $os.runProgram('/opt/bitnami/scripts/tomcat/restart.sh');
  }

  /**
   * Start the Tomcat server
   * @function handler.jspservers.tomcat~start
   * @example
   * restart();
   */
  start() {
    return $os.runProgram('/opt/bitnami/scripts/tomcat/start.sh');
  }

  /**
   * Stop the Tomcat server
   * @function handler.jspservers.tomcat~stop
   * @example
   * restart();
   */
  stop() {
    return $os.runProgram('/opt/bitnami/scripts/tomcat/stop.sh');
  }

  // Application management
  /**
   * Set the application installing page
   * @function handler.jspservers.tomcat~setInstallingPage
   * @example
   * // Add installing page
   * setInstallingPage();
   */
  setInstallingPage() {
    const rootDir = $file.join(this.dataDir, 'ROOT');
    const indexFile = $file.join(rootDir, 'index.jsp');
    const webFile = $file.join(rootDir, 'WEB-INF', 'web.xml');
    $file.copy($file.join(__dirname, '../../loading_page/*'), rootDir);
    const header = '<%@ '
      + 'page session="false" '
      + 'pageEncoding="UTF-8" '
      + 'contentType="text/html; '
      + 'charset=UTF-8" %>\n'
      + '<%-- If request has a query parameter in the form `index.jsp?404`, then return 404, else return 503 --%>\n'
      + '<%\n'
      + '  if(request.getQueryString()!=null && request.getQueryString().equals("404")) {\n'
      + '    response.setStatus(404);\n'
      + '  } else {\n'
      + '    response.setStatus(503);\n'
      + '  }\n'
      + '%>\n';
    const body = $file.read($file.join(rootDir, 'index.html'));
    $file.delete($file.join(rootDir, 'index.html'));
    if (!$file.exists(indexFile.concat('.back'))) $file.rename(indexFile, indexFile.concat('.back'));
    $file.write(indexFile, header.concat(body));

    if (!$file.exists(webFile.concat('.back'))) $file.copy(webFile, webFile.concat('.back'));
    // Set `index.jsp?404` as the location for 404 error page
    $file.substitute(
      webFile, /<\/web-app>/,
      '  <error-page>\n'
      + '    <error-code>404</error-code>\n'
      + '    <location>/index.jsp?404</location>\n'
      + '  </error-page>\n'
      + '</web-app>'
    );
  }

  /**
   * Remove the application installing page
   * @function handler.jspservers.tomcat~removeInstallingPage
   * @param {Object} [options] - Options object
   * @param {string} [options.redirectTo] - Additionally, add a redirect to the ROOT page
   * @example
   * // Remove installing page
   * removeInstallingPage();
   * @example
   * // Remove installing page and redirect to 'Jenkins'
   * removeInstallingPage({redirectTo: '/jenkins'});
   */
  removeInstallingPage(options) {
    options = options || {};
    const rootDir = $file.join(this.dataDir, 'ROOT');
    const indexFile = $file.join(rootDir, 'index.jsp');
    const webFile = $file.join(rootDir, 'WEB-INF', 'web.xml');
    $file.delete($file.join(rootDir, 'img'));
    $file.rename(indexFile.concat('.back'), indexFile);
    $file.rename(webFile.concat('.back'), webFile);
    if (!_.isEmpty(options.redirectTo)) {
      let url = '';
      if (!_.isEmpty(options.host)) url = `http://${options.host}:${options.port}`;
      if (!_.isEmpty(options.url)) url = options.url;
      url = url.concat(options.redirectTo);
      const redirectString = `response.sendRedirect("${url}");`;
      if (!$file.contains(indexFile, redirectString)) $file.substitute(indexFile, /^<%\s*$/m, `<%\n${redirectString}`);
    }
  }

  /**
   * Wait until the Tomcat log file contains a given pattern
   * @function handler.jspservers.tomcat~waitForLogEntry
   * @param {string|RegExp} pattern - Glob like pattern or regexp to match
   * @param {Object} [options] - Options object
   * @param {string} [options.encoding] - Encoding used to read the file
   * @param {string} [options.timeout] - Time to wait
   * @example
   * // Wait until the Tomact log file matches 'Jenkins is fully up and running'
   * waitForLogEntry(/Jenkins is fully up and running/);
   */
  waitForLogEntry(pattern, options) {
    // Patch for 3dc3788
    return logFunctions.waitForEntry($file.join(this.logsDir, 'catalina.out'), pattern, options);
  }

  /**
   * Add a variable to the setenv.sh file
   * @function handler.jspservers.tomcat~addEnvironmentVar
   * @param {Object} vars - Variables to set
   * @param {Object} [options] - Options object
   * @param {string} [options.comment] - Comment to prepend
   * @example
   * addEnvironmentVar({
   *   JENKINS_HOME: '/bitnami/jenkins',
   *   JAVA_OPTS: '-Xms256M -Xmx512M $JAVA_OPTS'
   * });
   */
  addEnvironmentVar(vars, options) {
    options = options || {override: false};
    const envFile = $file.join(this.binDir, 'setenv.sh');
    const comment = _.isEmpty(options.comment) ? '' : `# ${options.comment}`;
    _.each(vars, (value, name) => {
      if (_.isUndefined(value)) throw new Error('Bad format');
      if (_.isEmpty(value)) $app.warn(`The value of ${name} is empty`);
      // If override is true, check if it is previously defined
      if (options.override && $file.contains(envFile, new RegExp(`^${name}.*`, 'm'))) {
        $file.substitute(envFile, [
          {
            pattern: new RegExp(`^${name}.*$`, 'm'),
            value: `${comment}\n${name}="${value}"`,
          },
          {
            pattern: new RegExp(`^export\\s*${name}.*$`, 'm'),
            value: `export ${name}`,
          },
        ]);
      } else {
        $file.puts(envFile, `${comment}\n${name}="${value}"\nexport ${name}`);
      }
    });
  }

  /**
   * Link a web root folder to the Tomcat webapps folder and set it to ROOT
   * @function handler.jspservers.tomcat~deploy
   * @param {string} webroot - Application webroot
   * @example
   * // $app.installdir: /opt/bitnami/jenkins
   * deploy($app.installdir);
   * // webapps/jenkins is removed first and a link with the same name is created pointing to $app.installdir:
   * // /opt/bitnami/tomcat/webapps/jenkins -> /opt/bitnami/jenkins (link)
   * @example
   * // $app.installdir: /opt/bitnami/jenkins
   * deploy($app.installdir, {as: 'ROOT'});
   * // webapps/ROOT is removed first and a link with the same name is created pointing to $app.installdir:
   * // /opt/bitnami/tomcat/webapps/ROOT => /opt/bitnami/jenkins (link)
   */
  deploy(webroot, options) {
    options = _.defaults(options || {}, {as: $file.basename(webroot)});
    const prefixPath = $file.join(this.dataDir, options.as);
    $file.delete(prefixPath);
    $file.link(webroot, prefixPath, {force: true});
  }
}
module.exports = TomcatHandler;
