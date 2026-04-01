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
