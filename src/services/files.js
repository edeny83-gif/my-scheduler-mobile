// 파일 고르기·사진 찍기·녹음 결과를 AI 모듈이 쓰는 공통 file 객체로 바꾼다
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

const extOf = (name) => (String(name).split('.').pop() || '').toLowerCase();

function fromUri(uri, name, size) {
  if (Platform.OS === 'web') {
    const blob = () => fetch(uri).then((r) => r.blob());
    return {
      uri, name, ext: extOf(name), size: size || 0,
      bytes: async () => new Uint8Array(await (await blob()).arrayBuffer()),
      base64: async () => {
        const b = await blob();
        return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(b); });
      },
      upload: null,
    };
  }
  const { File, UploadType } = require('expo-file-system');
  const f = new File(uri);
  return {
    uri, name, ext: extOf(name), size: size || f.size || 0,
    bytes: () => f.bytes(),
    base64: () => f.base64(),
    // 큰 녹음은 메모리에 올리지 않고 파일째 전송 (Gemini 파일 업로드 API)
    upload: (url, headers) => f.upload(url, { httpMethod: 'POST', uploadType: UploadType.BINARY_CONTENT, headers }),
  };
}

export async function pickDocuments() {
  const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
  if (r.canceled) return [];
  return r.assets.map((a) => fromUri(a.uri, a.name, a.size));
}

export async function pickPhotos() {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.85 });
  if (r.canceled) return [];
  return r.assets.map((a, i) => fromUri(a.uri, a.fileName || `사진-${i + 1}.jpg`, a.fileSize));
}

export async function takePhoto() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('카메라 권한이 필요합니다');
  const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (r.canceled) return [];
  const a = r.assets[0];
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return [fromUri(a.uri, a.fileName || `촬영-${stamp}.jpg`, a.fileSize)];
}

export function fromRecording(uri, durationMs) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const ext = extOf(uri) || 'm4a';
  const f = fromUri(uri, `녹음-${stamp}.${ext}`, 0);
  f.durationMs = durationMs;
  return f;
}
