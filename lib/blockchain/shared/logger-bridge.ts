import { getLogger } from "@/lib/utils/logger";
import { LogLevel, setBlockchainLoggerTransport } from "./logging-utils";

const log = getLogger("blockchain");

// Bridge blockchain logger to app logger transport
setBlockchainLoggerTransport(
  (level: LogLevel, message: string, context?: Record<string, any>) => {
    switch (level) {
      case LogLevel.DEBUG:
        log.debug(message, context);
        break;
      case LogLevel.INFO:
        log.info(message, context);
        break;
      case LogLevel.WARN:
        log.warn(message, context);
        break;
      case LogLevel.ERROR:
        log.error(message, context);
        break;
    }
  },
);
