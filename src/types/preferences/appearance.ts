export type BubbleAnimationStyle = 'float' | 'drift' | 'orbit' | 'still';

export interface AppearancePreferences {
  accentColor: string;
  backgroundColor: string;
  buttonColor: string;
  bubbleColor: string;
  bubbleAnimation: BubbleAnimationStyle;
}
