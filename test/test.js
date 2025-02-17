const path = require("path");
const chai = require("chai");
const sinon = require("sinon");
const loaderUtils = require("loader-utils");
const replaceAll = require("string.prototype.replaceall");
const loader = require("../");

const { expect, assert } = chai;
const getOptions = sinon.stub(loaderUtils, "getOptions");

let context = {};
let callback;

function cleanSource(source) {
  return replaceAll(source, __dirname, "");
}

beforeEach(async () => {
  callback = sinon.spy();

  context = {
    async: () => callback,
    emitWarning: sinon.stub(),
    resourcePath: path.resolve(__dirname, "mock", "test.js"),
  };

  getOptions.callsFake(() => ({
    resolve: {
      alias: {
        MODULES: "./modules",
      },
    },
  }));
});

describe("loader", () => {
  describe('import "*.js"', () => {
    it("should expand glob import files", async () => {
      // Double Quotes
      await loader.call(context, 'import "./modules/*.js";');

      let [err, source] = callback.getCall(0).args;

      expect(err).to.be.null;
      expect(cleanSource(source)).to.equal(
        'import "/mock/modules/a.js"; import "/mock/modules/b.js"; import "/mock/modules/c.js";'
      );

      // Double Quotes w/Alias
      await loader.call(context, 'import "MODULES/*.js";');

      [err, source] = callback.getCall(1).args;

      expect(err).to.be.null;
      expect(cleanSource(source)).to.equal(
        'import "/mock/modules/a.js"; import "/mock/modules/b.js"; import "/mock/modules/c.js";'
      );

      // Single Quotes
      await loader.call(context, "import './modules/*.js';");

      [err, source] = callback.getCall(2).args;

      expect(err).to.be.null;
      expect(cleanSource(source)).to.equal(
        "import '/mock/modules/a.js'; import '/mock/modules/b.js'; import '/mock/modules/c.js';"
      );

      // Single Quotes w/Alias
      await loader.call(context, "import 'MODULES/*.js';");

      [err, source] = callback.getCall(3).args;

      expect(err).to.be.null;
      expect(cleanSource(source)).to.equal(
        "import '/mock/modules/a.js'; import '/mock/modules/b.js'; import '/mock/modules/c.js';"
      );
    });

    it("should honor comment after expanding glob import files", async () => {
      await loader.call(context, '//import "./modules/*.js";');

      let [err, source] = callback.getCall(0).args;

      expect(err).to.be.null;
      expect(cleanSource(source)).to.equal(
        '//import "/mock/modules/a.js"; import "/mock/modules/b.js"; import "/mock/modules/c.js";'
      );

      await loader.call(context, '// import "MODULES/*.js";');

      [err, source] = callback.getCall(1).args;

      expect(err).to.be.null;
      expect(cleanSource(source)).to.equal(
        '// import "/mock/modules/a.js"; import "/mock/modules/b.js"; import "/mock/modules/c.js";'
      );
    });

    it("should emit warning when import nothing", async () => {
      await loader.call(context, 'import "./unknown/*.js";');

      assert.equal(context.emitWarning.called, true);
    });
  });

  describe('import modules from "*.js"', () => {
    it("should expand glob import files but not add a global variable", async () => {
      await loader.call(context, 'import modules from "./modules/*.js";');

      let [err, source] = callback.getCall(0).args;

      expect(cleanSource(source)).to.equal(
        'import * as modules0 from "/mock/modules/a.js"; import * as modules1 from "/mock/modules/b.js"; import * as modules2 from "/mock/modules/c.js";'
      );
    });

    it("should expand glob import files and add a global variable as an array", async () => {
      getOptions.callsFake(() => ({
        banner(paths, varname) {
          return ` var ${varname} = [${paths
            .map(({ module }) => module)
            .join(", ")}];`;
        },
      }));

      await loader.call(context, 'import modules from "./modules/*.js";');

      let [err, source] = callback.getCall(0).args;

      expect(cleanSource(source)).to.equal(
        'import * as modules0 from "/mock/modules/a.js"; import * as modules1 from "/mock/modules/b.js"; import * as modules2 from "/mock/modules/c.js"; var modules = [modules0, modules1, modules2];'
      );
    });

    it("should expand glob import files and add a global variable as an object", async () => {
      getOptions.callsFake(() => ({
        banner(paths, varname) {
          return ` var ${varname} = [${paths
            .map((mod) => `{path:${mod.path},module:${mod.module}}`)
            .join(",")}];`;
        },
      }));

      await loader.call(context, 'import modules from "./modules/*.js";');

      let [err, source] = callback.getCall(0).args;

      expect(cleanSource(source)).to.equal(
        'import * as modules0 from "/mock/modules/a.js"; import * as modules1 from "/mock/modules/b.js"; import * as modules2 from "/mock/modules/c.js"; var modules = [{path:"/mock/modules/a.js",module:modules0},{path:"/mock/modules/b.js",module:modules1},{path:"/mock/modules/c.js",module:modules2}];'
      );

      getOptions.callsFake(() => ({}));

      await loader.call(context, 'import modules from "./modules/*.js";');

      [err, source] = callback.getCall(1).args;

      expect(cleanSource(source)).to.equal(
        'import * as modules0 from "/mock/modules/a.js"; import * as modules1 from "/mock/modules/b.js"; import * as modules2 from "/mock/modules/c.js";'
      );
    });
  });

  describe("import from *.scss", () => {
    it("should import glob scss files", async () => {
      await loader.call(context, '@import "MODULES/*.{s,}css";');

      let [err, source] = callback.getCall(0).args;

      expect(err).to.be.null;
      expect(cleanSource(source)).to.equal(
        '@import "/mock/modules/a.scss"; @import "/mock/modules/b.css";'
      );
    });

    it("should honor comment after expanding glob import files", async () => {
      await loader.call(context, '//@import "./modules/*.scss";');

      let [err, source] = callback.getCall(0).args;

      expect(err).to.be.null;
      expect(cleanSource(source)).to.equal('//@import "/mock/modules/a.scss";');

      await loader.call(context, '// @import "./modules/*.{sc,le,c}ss";');

      [err, source] = callback.getCall(1).args;

      expect(err).to.be.null;
      expect(cleanSource(source)).to.equal(
        '// @import "/mock/modules/a.scss"; @import "/mock/modules/b.css"; @import "/mock/modules/c.less";'
      );
    });
  });

  describe("from node_modules", () => {
    it("should load node_modules files", async () => {
      getOptions.callsFake(() => ({
        resolve: {
          modules: [path.resolve(__dirname, "./mock/modules")],
        },
      }));

      await loader.call(context, 'import "fake_module/*.js";');

      let [err, source] = callback.getCall(0).args;

      expect(err).to.be.null;
      expect(cleanSource(source)).to.equal(
        'import "/mock/modules/fake_module/a.js"; import "/mock/modules/fake_module/b.js";'
      );
    });
  });
});
