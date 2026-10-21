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

export interface OnReady {
  /** Called once every service is initialized, i.e. to start serving requests.
   *
   * @return A promise that resolves when the service is ready.
   */
  onReady(): Promise<void> | void;
}

export interface OnShutdown {
  /** Called on application shutdown before any service is destroyed, i.e. to stop serving requests.
   *
   * @return A promise that resolves when the service stopped.
   */
  onShutdown(): Promise<void> | void;
}
