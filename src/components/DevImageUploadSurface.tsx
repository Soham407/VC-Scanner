import * as ImagePicker from 'expo-image-picker';
import { JSX, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { prepareImage } from '../lib/imagePrep';
import { uploadCardImage } from '../lib/upload';

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
      <Pressable
        accessibilityRole="button"
        disabled={isPicking}
        onPress={() => {
          void handlePickImage();
        }}
        style={[styles.button, isPicking && styles.disabledButton]}
      >
        <Text style={styles.buttonLabel}>Pick image</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={!pickedImageUri || isPreparing}
        onPress={() => {
          void handlePrepare();
        }}
        style={[styles.button, (!pickedImageUri || isPreparing) && styles.disabledButton]}
      >
        <Text style={styles.buttonLabel}>Prepare</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={!preparedCachePath || !leadId || isUploading}
        onPress={() => {
          void handleUpload();
        }}
        style={[styles.button, (!preparedCachePath || !leadId || isUploading) && styles.disabledButton]}
      >
        <Text style={styles.buttonLabel}>Upload</Text>
      </Pressable>

      {leadId ? <Text style={styles.meta}>leadId: {leadId}</Text> : null}
      {preparedCachePath ? <Text style={styles.meta}>prepared: {preparedCachePath}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#111827',
    borderRadius: 6,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  container: {
    left: 12,
    position: 'absolute',
    top: 48,
    zIndex: 5
  },
  disabledButton: {
    opacity: 0.45
  },
  meta: {
    color: '#ffffff',
    fontSize: 11,
    marginBottom: 2,
    maxWidth: 260
  }
});
