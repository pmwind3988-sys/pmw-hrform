import { Theme } from './settings/types';
import { PMWCareerPagesReview } from './components/generated/PMWCareerPagesReview';

let theme: Theme = 'light';

function App() {
  function setTheme(theme: Theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  setTheme(theme);

  return (
    <>
      <PMWCareerPagesReview />
    </>
  ); // %EXPORT_STATEMENT%
}

export default App;
