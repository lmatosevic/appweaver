export interface OnInit {
  onInit(): Promise<void> | void;
}

export interface OnDestroy {
  onDestroy(): Promise<void> | void;
}
