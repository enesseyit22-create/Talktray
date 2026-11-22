import { useLocalSearchParams } from 'expo-router';

import { SharedListScreen } from '@/screens/SharedListScreen';

export default function SharedListRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SharedListScreen listId={Array.isArray(id) ? id[0] ?? '' : id ?? ''} />;
}
