'use client';

import type { MediaLibraryModel } from '@/hooks/media/library/useMediaLibraryModal';
import MediaTransferDialog from './MediaTransferDialog';
import PackEditor from './PackEditor';
import LibraryPackViewer from './LibraryPackViewer';
import LibraryItemMenu from './LibraryItemMenu';

/** The dialogs over the library: the pack editor, the pack viewer and one item's menu. */
export default function MediaLibraryOverlays({ vm }: { vm: MediaLibraryModel }) {
  return (
    <>
      {vm.transfer && <MediaTransferDialog transfer={vm.transfer} packs={vm.packs} myPubkey={vm.myPubkey} serverDraft={vm.canEditServer ? vm.serverDraft : undefined} onPreview={vm.previewTransfer} onClose={vm.closeTransfer} />}
      {vm.editing && <PackEditor
        key={vm.editorVersion}
        pack={vm.editing}
        initialKind={vm.editorKind}
        onClose={vm.closeEditor}
        onSaved={vm.editorSaved}
        publish={vm.publishDraft}
        onImport={vm.importDraft}
        onRefresh={vm.refreshDraft}
      />}
      {!vm.editing && !vm.transfer && vm.viewingPack && <LibraryPackViewer vm={vm} pack={vm.viewingPack} closeOnEscape={!vm.selectedMedia} />}
      {!vm.editing && !vm.transfer && vm.selectedMedia && <LibraryItemMenu vm={vm} selection={vm.selectedMedia} />}
    </>
  );
}
