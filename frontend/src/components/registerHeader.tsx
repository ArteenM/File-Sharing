interface Page
{
    onPageChange: (page: PageType) => (void)
}

type PageType = 'login' | 'inputFile' | 'register'

const RegisterHeader: React.FC<Page> = ({onPageChange}) => {

    return (
        <header>
            <nav>
                <div className="hover:underline text-blue-600">
                    <button onClick={() => onPageChange('register')} className="flex gap-16"> Register </button>
                    <button onClick={() => onPageChange('login')} className="flex gap-16">Login </button>
                </div>
            </nav>
        </header>
    )
}


export default RegisterHeader