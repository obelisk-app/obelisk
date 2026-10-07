'use client';

import type { MediaLibraryModel } from '@/hooks/media/library/useMediaLibraryModal';
import PackEditor from './PackEditor';
import LibraryPackViewer from './LibraryPackViewer';
import LibraryItemMenu from './LibraryItemMenu';

/** The dialogs over the library: the pack editor, the pack viewer and one item's menu. */
export default function MediaLibraryOverlays({ vm }: { vm: MediaLibraryModel }) {
  return (
    <>
      {vm.editing && !vm.isServer && <PackEditor
        pack={vm.editing}
        initialKind={vm.editorKind}
        onClose={vm.closeEditor}
        onSaved={vm.editorSaved}
      />}
      {vm.viewingPack && <LibraryPackViewer vm={vm} pack={vm.viewingPack} closeOnEscape={!vm.selectedMedia} />}
      {vm.selectedMedia && <LibraryItemMenu vm={vm} selection={vm.selectedMedia} />}
    </>
  );
}
