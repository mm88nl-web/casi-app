import { CasiMark } from '@/components/v9';

export default function BrandFooter() {
  return (
    <div style={{
      marginTop: 24,
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink)',
    }}>
      <CasiMark width={56} height={28} className="" />
    </div>
  );
}
