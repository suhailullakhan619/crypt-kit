import { Link } from 'react-router-dom';
import { EmptyCrypt } from '../components/spooky';
import { Card } from '../components/ui/display';
import { buttonVariants } from '../components/ui/button';
export default function NotFound() {
  return (
    <Card className="mx-auto mt-6 max-w-xl">
      <EmptyCrypt title="This page has passed on" action={<Link to="/" className={buttonVariants()}>Back to the dashboard</Link>}>
        The page you were looking for has vanished into the mist.
      </EmptyCrypt>
    </Card>
  );
}