import { Link } from 'react-router-dom';
import { EmptyCrypt } from '../components/spooky';
import { buttonVariants } from '../components/ui/button';

export default function NotFound() {
  return (
    <EmptyCrypt title="This page has passed on" action={<Link to="/" className={buttonVariants()}>Back to the dashboard</Link>}>
      The page you were looking for has vanished into the mist.
    </EmptyCrypt>
  );
}
