import { customerProfile } from '../../lib/customerProfile';

const services = [
  { customer_name: 'Ahmet Yılmaz', phone: '', plate: '59 AB 111', vehicle_brand: 'Fiat', vehicle_model: 'Ducato', arrival_date: '2026-01-10' },
  { customer_name: 'ahmet  yılmaz', phone: '05551112233', plate: '59 AB 222', vehicle_brand: 'Ford', vehicle_model: 'Transit', arrival_date: '2026-09-01' },
  { customer_name: 'Mehmet Kaya', is_trailer: true, plate: '', vehicle_brand: 'Hobby', arrival_date: '2026-05-01' },
];
const contracts = [{ customer_name: 'Veli Can', customer_phone: '05330000000' }];

test('en yeni servisten telefon + plaka + araç; ad büyük/küçük harf ve boşluk duyarsız', () => {
  expect(customerProfile('AHMET YILMAZ', services, contracts)).toEqual({
    phone: '05551112233', plate: '59 AB 222', vehicle_brand: 'Ford', vehicle_model: 'Transit', is_trailer: false,
  });
});

test('çekme karavan: plaka boş, marka gelir; servis yoksa telefon sözleşmeden', () => {
  expect(customerProfile('Mehmet Kaya', services, contracts)).toMatchObject({ plate: '', vehicle_brand: 'Hobby', is_trailer: true });
  expect(customerProfile('Veli Can', services, contracts).phone).toBe('05330000000');
  expect(customerProfile('', services, contracts).phone).toBe('');
});
