import { StyleSheet, FlatList } from 'react-native';
import { useState } from 'react'
import EditScreenInfo from '@/components/EditScreenInfo';
import { Checkbox } from 'expo-checkbox';
import { Text, View } from '@/components/Themed';

const DATA = [
  {
    id: 'bd7acbea-c1b1-46c2-aed5-3ad53abb28ba',
    title: 'First Item',
  },
  {
    id: '3ac68afc-c605-48d3-a4f8-fbd91aa97f63',
    title: 'Second Item',
  },
  {
    id: '58694a0f-3da1-471f-bd96-145571e29d72',
    title: 'Third Item',
  },
];

export default function TabOneScreen() {

  const [isChecked, setChecked] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tab One</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      
      {/* <FlatList
        style={{ width: '80%'}}
        data={DATA}
        renderItem={({ item }) => <Text>{item.title}</Text>}
        keyExtractor={(item) => item.id}
      /> */}

      <View style={{ width: '90%', display: 'flex', flexDirection: 'row' }}>
        <View style={{width:20, }}></View>
        <Text>nome_aluno</Text>
        <Checkbox
          style={styles.checkbox}
          value={isChecked}
          onValueChange={setChecked}
          color={isChecked ? '#4630EB' : undefined}
        />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
    checkbox: {
    margin: 8,
  },
});
