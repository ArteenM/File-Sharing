interface Page
{
    onPageChange: (page: PageType) => (void)
}

type PageType = 'login' | 'inputFile' | 'register'

const RegisterHeader: React.FC<Page> = ({onPageChange}) => {

    return (
  <header className="header bg-white shadow">
    <nav className="flex justify-center" >
      <button
        onClick={() => onPageChange('register')}
        className="text-black py-2 px-4 disabled:cursor-not-allowed mt-4"
      >
        Register
      </button>
      <button
        onClick={() => onPageChange('login')}
        className="text-black py-2 px-4 disabled:cursor-not-allowed mt-4"
      >
        Login
      </button>
    </nav>
  </header>
);

}


export default RegisterHeader