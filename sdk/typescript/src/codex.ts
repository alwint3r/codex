import { CodexOptions } from "./codexOptions";
import { CodexExec } from "./exec";
import { parseUsageLimits, UsageLimits } from "./status";
import { Thread } from "./thread";
import { ThreadOptions } from "./threadOptions";

/**
 * Codex is the main class for interacting with the Codex agent.
 *
 * Use the `startThread()` method to start a new thread or `resumeThread()` to resume a previously started thread.
 */
export class Codex {
  private exec: CodexExec;
  private options: CodexOptions;

  constructor(options: CodexOptions = {}) {
    const { codexPathOverride, env, config } = options;
    this.exec = new CodexExec(codexPathOverride, env, config);
    this.options = options;
  }

  /**
   * Starts a new conversation with an agent.
   * @returns A new thread instance.
   */
  startThread(options: ThreadOptions = {}): Thread {
    return new Thread(this.exec, this.options, options);
  }

  /**
   * Resumes a conversation with an agent based on the thread id.
   * Threads are persisted in ~/.codex/sessions.
   *
   * @param id The id of the thread to resume.
   * @returns A new thread instance.
   */
  resumeThread(id: string, options: ThreadOptions = {}): Thread {
    return new Thread(this.exec, this.options, options, id);
  }

  /**
   * Reads the current account usage limits that power the CLI `/status` view.
   */
  async status(): Promise<UsageLimits> {
    const raw = await this.exec.status({
      baseUrl: this.options.baseUrl,
      apiKey: this.options.apiKey,
    });
    return parseUsageLimits(raw);
  }
}
