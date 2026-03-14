import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { Dialog } from 'primereact/dialog';

interface ImagePreviewOverlayProps {
  src?: string;
  imageUrl?: string;
}

export interface ImagePreviewOverlayRef {
  show: () => void;
  hide: () => void;
}

const ImagePreviewOverlay = forwardRef<ImagePreviewOverlayRef, ImagePreviewOverlayProps>(
  ({ src, imageUrl }, ref) => {
    const [visible, setVisible] = useState(false);
    const url = imageUrl || src || '';

    useImperativeHandle(ref, () => ({
      show: () => setVisible(true),
      hide: () => setVisible(false),
    }));

    return (
      <Dialog
        visible={visible}
        onHide={() => setVisible(false)}
        header="Image Preview"
        style={{ width: '80vw', maxWidth: '800px' }}
        dismissableMask
      >
        {url && (
          <img
            src={url}
            alt="Preview"
            style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
          />
        )}
      </Dialog>
    );
  }
);

ImagePreviewOverlay.displayName = 'ImagePreviewOverlay';

export default ImagePreviewOverlay;
