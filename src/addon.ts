import { config } from "../package.json";
import { DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { PromptTemplate, SiteProfile } from "./services/types";
import { createZToolkit } from "./utils/ztoolkit";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    // Env type, see build.js
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
      selectedProfileId?: string;
      profiles?: SiteProfile[];
      selectedPromptTemplateId?: string;
      promptTemplates?: PromptTemplate[];
    };
    webAI?: {
      itemMenuRegistered: boolean;
      promptRegistered: boolean;
      readerMenuRegistered: boolean;
      readerMenuHandler?: (event: any) => void;
    };
    dialog?: DialogHelper;
  };
  // Lifecycle hooks
  public hooks: typeof hooks;
  // APIs
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
      webAI: {
        itemMenuRegistered: false,
        promptRegistered: false,
        readerMenuRegistered: false,
      },
    };
    this.hooks = hooks;
    this.api = {};
  }
}

export default Addon;
