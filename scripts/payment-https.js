const path = require('path');
process.env.TEST_JS_HTTPS = '1';
require(path.join(__dirname, '..', 'test.js'));
