import { memo } from 'react';
import { Snackbar } from '../design/openDesign';

import type { SystemNotice } from '../../store/scanner';

type SystemSnackbarProps = {
  notice: SystemNotice | null;
  onDismiss: () => void;
};

function SystemSnackbarImpl({ notice, onDismiss }: SystemSnackbarProps) {
  if (!notice) {
    return null;
  }

  return (
    <Snackbar
      action={{
        label: 'Dismiss',
        onPress: onDismiss
      }}
      onDismiss={onDismiss}
      testID="system-snackbar"
      visible
    >
      {`${notice.title}: ${notice.message}`}
    </Snackbar>
  );
}

export const SystemSnackbar = memo(SystemSnackbarImpl);
