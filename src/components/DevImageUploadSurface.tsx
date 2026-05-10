import * as ImagePicker from 'expo-image-picker';
import { JSX, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Button, Text } from '../design/openDesign';

import { prepareImage } from '../lib/imagePrep';
import { uploadCardImage } from '../lib/upload';
import { useAppTheme } from '../theme/materialTheme';

function createUuid(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === 'function') {
    return randomUuid.call(globalThis.crypto);
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => {
        resolve({ height, width });
      },
      (error) => {
        reject(error);
      }
    );
  });
}

export function DevImageUploadSurface(): JSX.Element {
  const theme = useAppTheme();
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [preparedCachePath, setPreparedCachePath] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handlePickImage = async (): Promise<void> => {
    setIsPicking(true);

    try {
      const pickedImageResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images']
      });

      if (pickedImageResult.canceled || pickedImageResult.assets.length === 0) {
        return;
      }

      const selectedUri = pickedImageResult.assets[0].uri;
      const generatedLeadId = createUuid();

      setPickedImageUri(selectedUri);
      setPreparedCachePath(null);
      setLeadId(generatedLeadId);

      console.log('Dev upload picked image', {
        leadId: generatedLeadId,
        uri: selectedUri
      });
    } finally {
      setIsPicking(false);
    }
  };

  const handlePrepare = async (): Promise<void> => {
    if (!pickedImageUri) {
      return;
    }

    setIsPreparing(true);

    try {
      const { cachePath } = await prepareImage(pickedImageUri);
      const dimensions = await getImageDimensions(cachePath);

      setPreparedCachePath(cachePath);

      console.log('Dev upload prepared image', {
        cachePath,
        height: dimensions.height,
        longEdge: Math.max(dimensions.width, dimensions.height),
        width: dimensions.width
      });
    } finally {
      setIsPreparing(false);
    }
  };

  const handleUpload = async (): Promise<void> => {
    if (!preparedCachePath || !leadId) {
      return;
    }

    setIsUploading(true);

    try {
      const storagePath = await uploadCardImage(preparedCachePath, leadId);

      console.log('Dev upload storage path', storagePath);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={styles.container} testID="dev-upload-surface">
      <Button
        compact
        disabled={isPicking}
        mode="contained-tonal"
        onPress={() => {
          void handlePickImage();
        }}
        style={styles.button}
      >
        Pick image
      </Button>

      <Button
        compact
        disabled={!pickedImageUri || isPreparing}
        mode="contained-tonal"
        onPress={() => {
          void handlePrepare();
        }}
        style={styles.button}
      >
        Prepare
      </Button>

      <Button
        compact
        disabled={!preparedCachePath || !leadId || isUploading}
        mode="contained-tonal"
        onPress={() => {
          void handleUpload();
        }}
        style={styles.button}
      >
        Upload
      </Button>

      {leadId ? <Text style={[styles.meta, { color: theme.colors.onSurface }]}>leadId: {leadId}</Text> : null}
      {preparedCachePath ? (
        <Text style={[styles.meta, { color: theme.colors.onSurface }]}>prepared: {preparedCachePath}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    marginBottom: 8
  },
  container: {
    left: 12,
    position: 'absolute',
    top: 48,
    zIndex: 5
  },
  meta: {
    fontSize: 11,
    marginBottom: 2,
    maxWidth: 260
  }
});
