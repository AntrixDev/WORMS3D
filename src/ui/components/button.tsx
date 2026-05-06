import './button.css'

interface ButtonProps {
  text: string;
  action: () => void;
}

function Button({ text, action }: ButtonProps){
    return (
        <button className='mainBtn' onClick={action}>{text}</button>
    )
}

export default Button