export type AppProfile = 'driver' | 'responsible';

export type BoardingStudent = {
  id: string;
  name: string;
  age: number;
  stopOrder: number;
  stopName: string;
  address: string;
  checkedIn: boolean;
  status: 'waiting' | 'present' | 'absent';
  time?: string;
};

export type DriverTrip = {
  routeName: string;
  schoolName: string;
  vehicleLabel: string;
  status: string;
  progressLabel: string;
  averageSpeed: string;
  nextStop: BoardingStudent;
  students: BoardingStudent[];
};

export type ResponsibleTrip = {
  routeName: string;
  schoolName: string;
  status: string;
  childName: string;
  childStatus: string;
  eta: string;
  lastUpdate: string;
  nextStop: string;
  driverName: string;
  vehicleLabel: string;
};

const students: BoardingStudent[] = [
  {
    id: '1',
    name: 'Lucas Andrade',
    age: 8,
    stopOrder: 4,
    stopName: 'Rua das Flores',
    address: 'Rua das Flores, 142',
    checkedIn: false,
    status: 'waiting',
  },
  {
    id: '2',
    name: 'Mariana Souza',
    age: 7,
    stopOrder: 2,
    stopName: 'Av. Central',
    address: 'Av. Central, 83',
    checkedIn: true,
    status: 'present',
    time: '07:12',
  },
  {
    id: '3',
    name: 'Pedro Henrique',
    age: 9,
    stopOrder: 3,
    stopName: 'Pca. Harmonia',
    address: 'Pca. Harmonia, 22',
    checkedIn: true,
    status: 'present',
    time: '07:18',
  },
  {
    id: '4',
    name: 'Beatriz Lima',
    age: 6,
    stopOrder: 5,
    stopName: 'Rua Alameda',
    address: 'Rua Alameda, 10',
    checkedIn: false,
    status: 'waiting',
  },
  {
    id: '5',
    name: 'Gabriel Martins',
    age: 10,
    stopOrder: 0,
    stopName: 'Nao embarca hoje',
    address: 'Ausencia avisada',
    checkedIn: false,
    status: 'absent',
  },
];

const driverTrip: DriverTrip = {
  routeName: 'Rota Escolar Segura',
  schoolName: 'Escola Vila Verde',
  vehicleLabel: 'Van 14/18 alunos',
  status: 'Em andamento',
  progressLabel: '50% concluido',
  averageSpeed: '28 km/h',
  nextStop: students[0],
  students,
};

const responsibleTrip: ResponsibleTrip = {
  routeName: 'Rota Escolar Segura',
  schoolName: 'Escola Vila Verde',
  status: 'Em transito',
  childName: 'Lucas M. Almeida',
  childStatus: 'A bordo',
  eta: '12 min',
  lastUpdate: '07:45',
  nextStop: 'Rua das Acacias, 142',
  driverName: 'Carlos Silva',
  vehicleLabel: 'Van Escolar Renault Master - ABC-1234',
};

export async function getDriverTrip(): Promise<DriverTrip> {
  return driverTrip;
}

export async function getResponsibleTrip(): Promise<ResponsibleTrip> {
  return responsibleTrip;
}
