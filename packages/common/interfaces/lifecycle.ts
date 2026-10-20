export interface OnInit {
  /** Called once during application initialization.
   * @return A promise that resolves when initialization is finished.
   */
  onInit(): Promise<void> | void;
}

export interface OnDestroy {
  /** Called on application shutdown to release allocated resources.
   *
   * @return A promise that resolves when resource releasing is finished.
   */
  onDestroy(): Promise<void> | void;
}

/** The options of the application start, passed to every {@link OnReady} service. */
export type ReadyOptions = {
  /** Whether the services serving requests, i.e. the HTTP server, start listening. */
  startServer: boolean;
};

export interface OnReady {
  /** Called once every service is initialized, i.e. to start serving requests.
   *
   * @param {ReadyOptions} options - The options of the application start.
   * @return A promise that resolves when the service is ready.
   */
  onReady(options: ReadyOptions): Promise<void> | void;
}

export interface OnShutdown {
  /** Called on application shutdown before any service is destroyed, i.e. to stop serving requests.
   *
   * @return A promise that resolves when the service stopped.
   */
  onShutdown(): Promise<void> | void;
}
