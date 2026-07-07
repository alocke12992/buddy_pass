import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/app/EmptyState';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl items-center px-4">
      <div className="w-full">
        <EmptyState
          icon={Compass}
          title="This page doesn't exist"
          action={
            <Button variant="outline" size="lg" render={<Link to="/" />}>
              Back home
            </Button>
          }
        />
      </div>
    </div>
  );
}
