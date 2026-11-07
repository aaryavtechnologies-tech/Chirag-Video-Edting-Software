import { LayoutColumns, type EditorLayoutProps } from './LayoutProvider';

export function PortraitLayout(props: EditorLayoutProps) {
  return <LayoutColumns {...props} />;
}
